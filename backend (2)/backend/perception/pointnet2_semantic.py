"""Third perception mode: live PointNet++ semantic segmentation.

Adapted from lidar.zip (adaptive_lidar_fastapi_dataset)'s perception/semantic.py,
which loads checkpoints/pointnet2_foveamap.pth and runs real inference, unlike
the density-only fallback in perception/semantic.py. See
FoveaMap_Integration_Plan.md for the full integration rationale.

Two things had to change to fit this project's existing pipeline rather than
lidar.zip's own:

1. INPUT FORMAT. lidar.zip's own preprocessing/pointcloud.preprocess_points
   requires (N, 4) x/y/z/intensity. This project's preprocessing/pointcloud.py
   returns whatever column count the source file had -- 4 for real KITTI
   .bin frames, but only 3 for .npy/.csv sources with no intensity channel.
   ensure_intensity_channel() pads a zero column rather than raising, so the
   model still runs (in a degraded state) on sources with no intensity.

2. OUTPUT TAXONOMY. The checkpoint only distinguishes 3 classes -- terrain /
   static / dynamic (config.py's CLASS_NAMES in lidar.zip) -- not the 8-class
   vocabulary (pedestrian/vehicle/curb/obstacle/road/building/terrain/unknown)
   that this project's perception/semantic.SEMANTIC_SCORE and the rest of the
   utility/IG scoring assume. CLASS_NAME_MAP below is an explicit, deliberately
   conservative guess at that mapping -- it has NOT been validated against
   what the checkpoint was actually trained on (see Open Questions in the
   integration plan). In particular "dynamic" is mapped to "pedestrian" (the
   more safety-critical of the two moving classes the SEMANTIC_SCORE table
   distinguishes) specifically so an actual pedestrian is never
   under-prioritized just because this coarser model can't tell people and
   vehicles apart. Revisit this the moment real per-class validation exists.

Also unlike the KITTI-label bridge, this mode has no per-point instance IDs,
so it cannot populate dynamic_objects for the tracker -- "dynamic" points
still raise the map's motion/importance signals (see DYNAMIC_MOTION_SIGNAL),
but there is nothing to hand perception's downstream object tracking. Use
perception_mode="ground_truth" if per-object tracking is required.
"""

import numpy as np

from perception.semantic import SEMANTIC_SCORE

# --- Lazy torch/model import -------------------------------------------
# Keeps this module importable (and controller.py's default ground_truth/
# generic modes fully usable) on machines without torch installed. Only
# constructing PointNet2Perception actually needs it.
_torch = None
_get_model = None


def _ensure_torch():
    global _torch, _get_model
    if _torch is None:
        import torch as torch_module
        from models.pointnet2_sem_seg import get_model as get_model_fn
        _torch = torch_module
        _get_model = get_model_fn
    return _torch, _get_model


# Checkpoint's native taxonomy (config.py's CLASS_NAMES in lidar.zip).
CHECKPOINT_CLASS_NAMES = {0: "terrain", 1: "static", 2: "dynamic"}

# See OUTPUT TAXONOMY note above -- unvalidated assumption, not ground truth.
CLASS_NAME_MAP = {
    0: "terrain",
    1: "obstacle",
    2: "pedestrian",
}

# Single-frame class output carries no velocity estimate. Rather than leave
# "dynamic" cells at motion=0 (which would suppress their utility score),
# apply a fixed nonzero prior so the IG/utility engine still treats them as
# more urgent than a static cell -- but don't fabricate a specific speed.
DYNAMIC_MOTION_SIGNAL = 0.5


def ensure_intensity_channel(points):
    """Returns an (N, 4) float32 array, padding a zero intensity column onto
    (N, 3) input rather than raising. See module docstring, point 1."""
    points = np.asarray(points, dtype=np.float32)
    if points.ndim != 2:
        raise ValueError(f"Expected a 2D points array, got shape {points.shape}")
    if points.shape[1] == 4:
        return points
    if points.shape[1] == 3:
        pad = np.zeros((points.shape[0], 1), dtype=np.float32)
        return np.concatenate([points, pad], axis=1)
    raise ValueError(f"Expected points with 3 or 4 columns, got shape {points.shape}")


def build_pointnet_features(points4):
    """The 9-channel feature stack the checkpoint was trained on (intensity,
    range, xy_range, azimuth, elevation, normalized xyz, height). Ported
    as-is from lidar.zip's perception/semantic.py / preprocessing/pointcloud.
    create_pointnet_features, kept pure-numpy so it's testable without torch.

    Input: (N, 4) x, y, z, intensity.
    Output: (9, N) float32.
    """
    x, y, z, intensity = points4[:, 0], points4[:, 1], points4[:, 2], points4[:, 3]

    xy_range = np.sqrt(x ** 2 + y ** 2)
    point_range = np.sqrt(x ** 2 + y ** 2 + z ** 2)
    azimuth = np.arctan2(y, x)
    elevation = np.arctan2(z, xy_range + 1e-8)

    xyz = points4[:, :3]
    xyz_mean = xyz.mean(axis=0)
    xyz_std = xyz.std(axis=0) + 1e-6
    normalized_xyz = (xyz - xyz_mean) / xyz_std

    height = z - np.min(z)

    intensity_min, intensity_max = intensity.min(), intensity.max()
    intensity_norm = (intensity - intensity_min) / (intensity_max - intensity_min + 1e-6)

    features = np.stack([
        intensity_norm, point_range, xy_range, azimuth, elevation,
        normalized_xyz[:, 0], normalized_xyz[:, 1], normalized_xyz[:, 2], height,
    ], axis=0)
    return features.astype(np.float32)


def sample_indices(n_points, num_points, seed=42):
    """Same fixed-seed sample-with/without-replacement scheme as lidar.zip's
    perception/semantic.py, so behavior (and any debugging comparisons
    against the original repo) stays reproducible frame to frame."""
    rng = np.random.default_rng(seed)
    if n_points >= num_points:
        return rng.choice(n_points, size=num_points, replace=False)
    return rng.choice(n_points, size=num_points, replace=True)


def aggregate_predictions_to_regions(points4, sampled_idx, predictions, confidence, config):
    """Grid-aggregates the (num_points,) per-sampled-point predictions into
    coarse cell regions, mirroring perception/kitti_labels._build_regions and
    the density-only fallback in perception/semantic.perceive, so this mode
    hands the map manager a similarly-sized region set (not one region per
    sampled point) regardless of which perception mode produced it.
    """
    if len(sampled_idx) == 0:
        return []

    res = config.resolution_levels[0]
    half_w, half_h = config.map_dimensions[0] / 2, config.map_dimensions[1] / 2

    x = points4[sampled_idx, 0]
    y = points4[sampled_idx, 1]
    in_bounds = (np.abs(x) <= half_w) & (np.abs(y) <= half_h)
    if not np.any(in_bounds):
        return []

    x, y = x[in_bounds], y[in_bounds]
    preds = predictions[in_bounds]
    conf = confidence[in_bounds]

    cx = np.floor((x + half_w) / res).astype(np.int64)
    cy = np.floor((y + half_h) / res).astype(np.int64)
    cell_key = cx * 1_000_003 + cy  # unique per (cx, cy); both >= 0 here
    uniq_cells, inv = np.unique(cell_key, return_inverse=True)
    n_cells = len(uniq_cells)

    counts = np.bincount(inv, minlength=n_cells)
    x_mean = np.bincount(inv, weights=x, minlength=n_cells) / counts
    y_mean = np.bincount(inv, weights=y, minlength=n_cells) / counts
    conf_mean = np.bincount(inv, weights=conf, minlength=n_cells) / counts

    n_classes = len(CHECKPOINT_CLASS_NAMES)
    composite = inv * n_classes + preds
    class_counts = np.bincount(composite, minlength=n_cells * n_classes).reshape(n_cells, n_classes)
    dominant = class_counts.argmax(axis=1)

    regions = []
    for i in range(n_cells):
        cls_id = int(dominant[i])
        cls_name = CLASS_NAME_MAP[cls_id]
        is_dynamic = cls_id == 2
        dist = float(np.hypot(x_mean[i], y_mean[i]))
        regions.append({
            "x": float(x_mean[i]), "y": float(y_mean[i]), "z": 0.0,
            "semantic_class": cls_name,
            "semantic_importance": SEMANTIC_SCORE.get(cls_name, 0.45),
            "motion": DYNAMIC_MOTION_SIGNAL if is_dynamic else 0.0,
            "uncertainty": max(0.05, 1.0 - float(conf_mean[i])),
            "geometry": min(1.0, float(counts[i]) / 40.0),
            "distance_relevance": 1.0 / (1.0 + dist / 10.0),
            "occupancy": min(1.0, float(counts[i]) / 30.0),
            "confidence": float(conf_mean[i]),
        })
    return regions


class PointNet2Perception:
    """Loads checkpoints/pointnet2_foveamap.pth once and exposes .perceive(
    points, config) in the same {"regions": [...], "dynamic_objects": []}
    schema as perception.semantic.perceive and
    perception.kitti_labels.KittiPerceptionBridge.build, so controller.py can
    switch perception modes without map_manager/tracker/predictor needing to
    know this mode exists.
    """

    def __init__(
        self,
        checkpoint_path="checkpoints/pointnet2_foveamap.pth",
        num_classes=3,
        num_points=2048,
        device=None,
    ):
        torch, get_model = _ensure_torch()
        self.num_points = num_points
        self.device = device or torch.device("cuda" if torch.cuda.is_available() else "cpu")

        self.model = get_model(num_classes)
        checkpoint = torch.load(checkpoint_path, map_location=self.device, weights_only=False)
        self.model.load_state_dict(checkpoint["model_state_dict"])
        # These WERE saved in the checkpoint by whatever Colab training run
        # produced it, but nothing in this repo ever read them back out --
        # the README could only say "validated in Colab, no numbers on hand".
        # Surfacing them here closes that gap: they're the training run's own
        # offline validation numbers (not computed against this repo's data),
        # so treat them as "what the checkpoint claims", distinct from
        # live_accuracy (evaluation/live_accuracy.py), which is measured
        # against this project's own ground truth as the demo actually runs.
        self.checkpoint_mean_iou = checkpoint.get("mean_iou")
        self.checkpoint_accuracy = checkpoint.get("accuracy")
        checkpoint_ious = checkpoint.get("ious")
        self.checkpoint_class_iou = (
            {CHECKPOINT_CLASS_NAMES[i]: float(v) for i, v in enumerate(checkpoint_ious)}
            if checkpoint_ious is not None else None
        )
        self.checkpoint_epoch = checkpoint.get("epoch")

        # Set by _predict()/perceive() on every call so a caller (controller.py,
        # for live accuracy scoring) can see exactly what was predicted for the
        # last frame without changing perceive()'s public return schema.
        self.last_points4 = None
        self.last_sampled_idx = None
        self.last_predictions = None
        self.last_confidence = None

        self.model = self.model.to(self.device)
        self.model.eval()

    def info(self):
        """Everything known about this checkpoint's OWN (offline, Colab-side)
        validation performance -- for a model-info panel/endpoint. This is
        NOT a live measurement; see evaluation/live_accuracy.py for that."""
        return {
            "checkpoint_mean_iou": self.checkpoint_mean_iou,
            "checkpoint_accuracy": self.checkpoint_accuracy,
            "checkpoint_class_iou": self.checkpoint_class_iou,
            "checkpoint_epoch": self.checkpoint_epoch,
            "class_names": CHECKPOINT_CLASS_NAMES,
            "note": "Offline validation numbers stored in the checkpoint file "
                    "itself (from the original training run), not measured "
                    "against this repo's data or live demo frames.",
        }

    def _predict(self, points4):
        torch, _ = _ensure_torch()
        n = len(points4)
        if n == 0:
            self.last_points4 = points4
            self.last_sampled_idx = np.empty(0, dtype=np.int64)
            self.last_predictions = np.empty(0, dtype=np.int64)
            self.last_confidence = np.empty(0, dtype=np.float32)
            return (
                np.empty(0, dtype=np.int64),
                np.empty(0, dtype=np.float32),
                np.empty(0, dtype=np.int64),
            )

        indices = sample_indices(n, self.num_points)
        features = build_pointnet_features(points4)
        sampled_features = features[:, indices]

        x_tensor = torch.from_numpy(sampled_features).float().unsqueeze(0).to(self.device)
        with torch.no_grad():
            output, _ = self.model(x_tensor)

        probabilities = torch.exp(output[0])
        predictions = torch.argmax(probabilities, dim=1)
        confidence = torch.max(probabilities, dim=1).values

        predictions_np = predictions.cpu().numpy()
        confidence_np = confidence.cpu().numpy()

        # Remembered so process_frame() can score these exact predictions
        # against ground truth for the same frame -- see live_accuracy.
        self.last_points4 = points4
        self.last_sampled_idx = indices
        self.last_predictions = predictions_np
        self.last_confidence = confidence_np

        return predictions_np, confidence_np, indices

    def perceive(self, points, config):
        """Drop-in replacement for perception.semantic.perceive's return
        shape, given raw points as produced by preprocessing.pointcloud.
        preprocess(frame, config)."""
        points4 = ensure_intensity_channel(points)
        predictions, confidence, sampled_idx = self._predict(points4)
        regions = aggregate_predictions_to_regions(points4, sampled_idx, predictions, confidence, config)
        return {"regions": regions, "dynamic_objects": []}
