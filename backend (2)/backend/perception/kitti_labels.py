"""
Bridge between raw ground-truth .label files (SemanticKITTI OR SemanticPOSS)
and this backend's perception output format (regions + dynamic_objects).

Why this exists:
  input/dataset_loader.py only reads point geometry (.bin) and an optional
  hand-written .json sidecar. It has no idea that a SemanticKITTI-style
  `labels/000123.label` file sitting next to `velodyne/000123.bin` contains
  real per-point semantic + instance ground truth. Without this bridge,
  perception/semantic.py falls back to density-only "unknown" blobs and the
  whole utility/tracking/prediction pipeline has nothing real to react to.

This module:
  1. Parses .label files (uint32 per point: low 16 bits = semantic class id,
     high 16 bits = instance id) -- this binary layout is shared by both
     SemanticKITTI and SemanticPOSS, but the two datasets use *completely
     different, overlapping* id numbers for that low-16-bit class id (e.g.
     SemanticKITTI's id 10 = car, SemanticPOSS's id 10 = one of the
     traffic-sign variants). Using the wrong table doesn't error -- it
     silently mislabels or dumps everything into "unknown" -- so which map
     applies to a given frame is auto-detected (see `detect_scheme` below)
     rather than assumed.
  2. Maps class ids (per-scheme) to this project's semantic categories.
  3. Produces coarse full-coverage terrain/static regions from ALL points
     (so the adaptive grid still sees the whole scene, not just objects).
  4. Clusters "thing" classes (car/person/bicyclist/...) by instance id into
     discrete detections, and tracks their centroids across frames itself
     (since raw ground truth gives no velocity) to produce vx/vy for the
     existing tracker.py to consume unchanged.

Usage: instantiate ONE KittiPerceptionBridge per running session (it holds
state across frames), and call .build(...) instead of perception.semantic.perceive
whenever the current frame has a label_path. The scheme (kitti/poss) is
detected per-frame from the label ids themselves unless overridden.
"""

import math
import numpy as np

# --- SemanticKITTI class id -> (our semantic_class name, category) -------
# category is one of: "drivable", "static", "dynamic"
# Reuses the class names already scored in perception/semantic.SEMANTIC_SCORE
# where a sensible match exists; unmapped/rare ids fall back to "unknown".
KITTI_CLASS_MAP = {
    0:   ("unknown", "static"),   # unlabeled
    1:   ("unknown", "static"),   # outlier
    10:  ("vehicle", "dynamic"),  # car
    11:  ("vehicle", "dynamic"),  # bicycle
    13:  ("vehicle", "dynamic"),  # bus
    15:  ("vehicle", "dynamic"),  # motorcycle
    16:  ("vehicle", "dynamic"),  # on-rails
    18:  ("vehicle", "dynamic"),  # truck
    20:  ("vehicle", "dynamic"),  # other-vehicle
    30:  ("pedestrian", "dynamic"),  # person
    31:  ("vehicle", "dynamic"),  # bicyclist
    32:  ("vehicle", "dynamic"),  # motorcyclist
    40:  ("road", "drivable"),    # road
    44:  ("road", "drivable"),    # parking
    48:  ("curb", "static"),      # sidewalk (proxy for curb boundary)
    49:  ("terrain", "drivable"),  # other-ground
    50:  ("building", "static"),  # building
    51:  ("obstacle", "static"),  # fence
    52:  ("obstacle", "static"),  # other-structure
    60:  ("road", "drivable"),    # lane-marking
    70:  ("obstacle", "static"),  # vegetation
    71:  ("obstacle", "static"),  # trunk
    72:  ("terrain", "drivable"),  # terrain
    80:  ("obstacle", "static"),  # pole
    81:  ("obstacle", "static"),  # traffic-sign
    99:  ("unknown", "static"),   # other-object
    252: ("vehicle", "dynamic"),  # moving-car
    253: ("vehicle", "dynamic"),  # moving-bicyclist
    254: ("pedestrian", "dynamic"),  # moving-person
    255: ("vehicle", "dynamic"),  # moving-motorcyclist
    256: ("vehicle", "dynamic"),  # moving-on-rails
    257: ("vehicle", "dynamic"),  # moving-bus
    258: ("vehicle", "dynamic"),  # moving-truck
    259: ("vehicle", "dynamic"),  # moving-other-vehicle
}

# --- SemanticPOSS class id -> (our semantic_class name, category) --------
# Official 14-class spec (poss.pku.edu.cn/semanticposs.html):
#   unlabeled(0), people(4,5), rider(6), car(7), trunk(8), plants(9),
#   traffic sign(10,11,12), pole(13), trashcan(14), building(15),
#   cone/stone(16), fence(17), bike(21), ground(22).
# id 20 shows up in some released scans but is not documented on the
# official class list -- left unmapped (falls back to "unknown" below)
# rather than guessed, per this project's rule of not overclaiming beyond
# what's actually verified.
POSS_CLASS_MAP = {
    0:  ("unknown", "static"),     # unlabeled
    4:  ("pedestrian", "dynamic"),  # people
    5:  ("pedestrian", "dynamic"),  # people
    6:  ("vehicle", "dynamic"),    # rider (person+bike, treated like KITTI bicyclist)
    7:  ("vehicle", "dynamic"),    # car
    8:  ("obstacle", "static"),    # trunk
    9:  ("obstacle", "static"),    # plants
    10: ("obstacle", "static"),    # traffic sign
    11: ("obstacle", "static"),    # traffic sign
    12: ("obstacle", "static"),    # traffic sign
    13: ("obstacle", "static"),    # pole
    14: ("obstacle", "static"),    # trashcan
    15: ("building", "static"),    # building
    16: ("obstacle", "static"),    # cone/stone
    17: ("obstacle", "static"),    # fence
    21: ("vehicle", "dynamic"),    # bike
    22: ("terrain", "drivable"),   # ground
}

SEMANTIC_SCORE = {
    "pedestrian": 1.0, "vehicle": 0.9, "curb": 0.75,
    "obstacle": 0.85, "road": 0.25, "building": 0.35,
    "terrain": 0.20, "unknown": 0.45,
}

# Backward-compat alias: existing code (and this file, below) that imported
# CLASS_MAP / DYNAMIC_IDS expecting the KITTI table keeps working unchanged.
CLASS_MAP = KITTI_CLASS_MAP
DYNAMIC_IDS = {k for k, v in CLASS_MAP.items() if v[1] == "dynamic"}

# --- Vectorized lookup tables (built once at import time, per scheme) -----
# Ids top out at 259 (KITTI's moving-* classes), so a flat array indexed by
# id is both simpler and far faster than a per-point dict/Python-loop lookup.
_MAX_ID = 300
_CLASS_NAMES = sorted(
    {name for name, _ in KITTI_CLASS_MAP.values()}
    | {name for name, _ in POSS_CLASS_MAP.values()}
    | {"unknown"}
)
_NAME_TO_IDX = {name: i for i, name in enumerate(_CLASS_NAMES)}
_UNKNOWN_IDX = _NAME_TO_IDX["unknown"]

_IMPORTANCE_BY_IDX = np.array(
    [SEMANTIC_SCORE.get(name, 0.45) for name in _CLASS_NAMES], dtype=float
)

CHECKPOINT_TAXONOMY = {"terrain": 0, "static": 1, "dynamic": 2}


def _build_tables(class_map):
    """Builds the (class_idx, is_dynamic, checkpoint_idx) lookup arrays for
    one id scheme. Called once per scheme at import time -- see _SCHEMES."""
    id_to_class_idx = np.full(_MAX_ID, _UNKNOWN_IDX, dtype=np.int64)
    id_to_is_dynamic = np.zeros(_MAX_ID, dtype=bool)
    id_to_checkpoint_idx = np.full(_MAX_ID, CHECKPOINT_TAXONOMY["static"], dtype=np.int64)
    for sid, (name, category) in class_map.items():
        id_to_class_idx[sid] = _NAME_TO_IDX[name]
        id_to_is_dynamic[sid] = (category == "dynamic")
        if category == "dynamic":
            id_to_checkpoint_idx[sid] = CHECKPOINT_TAXONOMY["dynamic"]
        elif category == "drivable":
            id_to_checkpoint_idx[sid] = CHECKPOINT_TAXONOMY["terrain"]
        # else: leave at the "static" default set above
    return {
        "class_idx": id_to_class_idx,
        "is_dynamic": id_to_is_dynamic,
        "checkpoint_idx": id_to_checkpoint_idx,
        "max_documented_id": max(class_map.keys()),
    }


_SCHEMES = {
    "kitti": _build_tables(KITTI_CLASS_MAP),
    "poss": _build_tables(POSS_CLASS_MAP),
}

# Kept as module-level names for any external/back-compat callers that
# reached into the KITTI-specific tables directly.
_ID_TO_CLASS_IDX = _SCHEMES["kitti"]["class_idx"]
_ID_TO_IS_DYNAMIC = _SCHEMES["kitti"]["is_dynamic"]
_ID_TO_CHECKPOINT_IDX = _SCHEMES["kitti"]["checkpoint_idx"]


def detect_scheme(semantic_ids):
    """Auto-detects which id scheme a frame's labels use.

    SemanticPOSS's documented ids top out at 22; real SemanticKITTI frames
    routinely contain road(40), building(50), vegetation(70), pole(80), etc,
    so any frame whose max id is <= 22 is essentially certainly SemanticPOSS,
    not an unusually sparse KITTI frame. This is a heuristic, not a format
    flag in the file itself -- if it ever misfires, pass scheme= explicitly
    to KittiPerceptionBridge.build() instead of relying on detection.
    """
    if len(semantic_ids) == 0:
        return "kitti"
    return "poss" if int(np.max(semantic_ids)) <= 22 else "kitti"


def to_checkpoint_taxonomy(semantic_ids, scheme="kitti"):
    """Maps raw ground-truth ids (already clipped to [0, _MAX_ID)) to the
    PointNet++ checkpoint's 3-class scheme: 0=terrain, 1=static, 2=dynamic.
    Vectorized lookup. `scheme` defaults to "kitti" for backward
    compatibility with existing callers (controller.py's pointnet2 branch
    only ever scores against real SemanticKITTI ground truth today)."""
    return _SCHEMES[scheme]["checkpoint_idx"][semantic_ids]


def load_label_file(path):
    """Returns (semantic_ids, instance_ids) arrays aligned to the point cloud.
    Binary layout is identical across SemanticKITTI and SemanticPOSS."""
    raw = np.fromfile(str(path), dtype=np.uint32)
    semantic_ids = raw & 0xFFFF
    instance_ids = raw >> 16
    return semantic_ids, instance_ids


class KittiPerceptionBridge:
    """Stateful: remembers last-seen centroid per track to derive velocity."""

    def __init__(self):
        self._history = {}  # track_id -> (x, y, timestamp)

    def reset(self):
        self._history.clear()

    def build(self, points, label_path, timestamp, config, point_mask=None, scheme=None):
        points = np.asarray(points, dtype=float)
        semantic_ids, instance_ids = load_label_file(label_path)

        active_scheme = scheme or detect_scheme(semantic_ids)
        tables = _SCHEMES[active_scheme]

        if point_mask is not None:
            # points has ALREADY been filtered upstream (e.g. by
            # preprocessing.pointcloud.preprocess); point_mask tells us
            # exactly which of the original (unfiltered) label entries
            # survive, so we can filter labels the same way instead of
            # naive truncation (which silently misaligns points to the
            # wrong labels the moment any filtering actually happens).
            n = min(len(point_mask), len(semantic_ids))
            semantic_ids = semantic_ids[:n][point_mask[:n]]
            instance_ids = instance_ids[:n][point_mask[:n]]
            if len(semantic_ids) != len(points):
                # Defensive fallback: shapes still don't line up (e.g. a
                # label file that doesn't match this point cloud at all) -
                # truncate rather than crash, but this should not happen
                # in normal operation.
                n2 = min(len(points), len(semantic_ids))
                points, semantic_ids, instance_ids = points[:n2], semantic_ids[:n2], instance_ids[:n2]
        else:
            n = min(len(points), len(semantic_ids))
            points, semantic_ids, instance_ids = points[:n], semantic_ids[:n], instance_ids[:n]

        semantic_ids = np.clip(semantic_ids, 0, _MAX_ID - 1).astype(np.int64)

        regions = self._build_regions(points, semantic_ids, config, tables)
        dynamic_objects = self._build_dynamic_objects(points, semantic_ids, instance_ids, timestamp, tables)

        # Fold dynamic-object centroids into regions too, so the adaptive
        # engine sees them as high-value cells (not just the tracker).
        for obj in dynamic_objects:
            regions.append({
                "x": obj["x"], "y": obj["y"], "z": obj["z"],
                "semantic_class": obj["class"],
                "semantic_importance": SEMANTIC_SCORE.get(obj["class"], 0.45),
                "motion": min(1.0, math.hypot(obj["vx"], obj["vy"]) / 3.0),
                "uncertainty": max(0.05, 1 - obj["confidence"]),
                "geometry": 0.6,
                "distance_relevance": 1 / (1 + math.hypot(obj["x"], obj["y"]) / 10),
                "occupancy": 0.95,
                "confidence": obj["confidence"],
            })

        return {"regions": regions, "dynamic_objects": dynamic_objects}

    def _build_regions(self, points, semantic_ids, config, tables):
        """Coarse full-coverage grid so terrain/static classes are represented
        everywhere, not only where a discrete object was detected. Fully
        vectorized: no per-point Python loop."""
        res = config.resolution_levels[0]
        half_w, half_h = config.map_dimensions[0] / 2, config.map_dimensions[1] / 2

        x, y = points[:, 0], points[:, 1]
        in_bounds = (np.abs(x) <= half_w) & (np.abs(y) <= half_h)
        is_dynamic = tables["is_dynamic"][semantic_ids]
        keep = in_bounds & ~is_dynamic
        if not np.any(keep):
            return []

        x, y = x[keep], y[keep]
        class_idx = tables["class_idx"][semantic_ids[keep]]

        cx = np.floor((x + half_w) / res).astype(np.int64)
        cy = np.floor((y + half_h) / res).astype(np.int64)
        cell_key = cx * 1_000_003 + cy  # unique per (cx, cy); both are >= 0 here

        uniq_cells, inv = np.unique(cell_key, return_inverse=True)
        n_cells = len(uniq_cells)

        counts = np.bincount(inv, minlength=n_cells)
        x_sum = np.bincount(inv, weights=x, minlength=n_cells)
        y_sum = np.bincount(inv, weights=y, minlength=n_cells)
        x_mean = x_sum / counts
        y_mean = y_sum / counts

        n_classes = len(_CLASS_NAMES)
        composite = inv * n_classes + class_idx
        class_counts = np.bincount(composite, minlength=n_cells * n_classes).reshape(n_cells, n_classes)
        dominant_idx = class_counts.argmax(axis=1)
        dominant_count = class_counts.max(axis=1)
        purity = dominant_count / counts

        dist = np.hypot(x_mean, y_mean)
        importance = _IMPORTANCE_BY_IDX[dominant_idx]
        uncertainty = np.maximum(0.05, 1 - purity)
        geometry = np.minimum(1.0, counts / 40.0)
        occupancy = np.minimum(1.0, counts / 30.0)
        distance_relevance = 1 / (1 + dist / 10)

        regions = []
        names = [_CLASS_NAMES[i] for i in dominant_idx]
        for i in range(n_cells):
            regions.append({
                "x": float(x_mean[i]), "y": float(y_mean[i]), "z": 0.0,
                "semantic_class": names[i],
                "semantic_importance": float(importance[i]),
                "motion": 0.0,
                "uncertainty": float(uncertainty[i]),
                "geometry": float(geometry[i]),
                "distance_relevance": float(distance_relevance[i]),
                "occupancy": float(occupancy[i]),
                "confidence": float(purity[i]),
            })
        return regions

    def _build_dynamic_objects(self, points, semantic_ids, instance_ids, timestamp, tables):
        """Clusters 'thing' classes by instance id. Vectorized aside from a
        final loop over unique tracks (typically tens, not tens of thousands)."""
        is_dynamic = tables["is_dynamic"][semantic_ids]
        has_instance = instance_ids > 0
        keep = is_dynamic & has_instance
        if not np.any(keep):
            return []

        x, y, z = points[keep, 0], points[keep, 1], points[keep, 2]
        sid = semantic_ids[keep]
        iid = instance_ids[keep].astype(np.int64)
        track_num = sid * 1_000_000 + iid

        uniq_tracks, inv = np.unique(track_num, return_inverse=True)
        n_tracks = len(uniq_tracks)
        counts = np.bincount(inv, minlength=n_tracks)
        x_mean = np.bincount(inv, weights=x, minlength=n_tracks) / counts
        y_mean = np.bincount(inv, weights=y, minlength=n_tracks) / counts
        z_mean = np.bincount(inv, weights=z, minlength=n_tracks) / counts
        track_sid = uniq_tracks // 1_000_000

        objects = []
        for i in range(n_tracks):
            cls_name = _CLASS_NAMES[tables["class_idx"][track_sid[i]]]
            track_id = str(uniq_tracks[i])
            tx, ty, tz = float(x_mean[i]), float(y_mean[i]), float(z_mean[i])
            prev = self._history.get(track_id)
            if prev:
                px, py, pt = prev
                dt = max(1e-3, timestamp - pt)
                vx, vy = (tx - px) / dt, (ty - py) / dt
            else:
                vx, vy = 0.0, 0.0
            self._history[track_id] = (tx, ty, timestamp)
            objects.append({
                "track_id": track_id, "class": cls_name,
                "x": tx, "y": ty, "z": tz, "vx": vx, "vy": vy,
                "confidence": min(1.0, 0.5 + int(counts[i]) / 200.0),
            })
        return objects