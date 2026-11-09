"""Live classification-accuracy metric for perception_mode="pointnet2".

Closes a real gap: perception/pointnet2_semantic.py stores the checkpoint's
own OFFLINE validation numbers (mean_iou/accuracy/per-class ious from
whatever Colab run trained it), but nothing measures how the model actually
performs against ground truth AS THE DEMO RUNS, on this repo's own data.

Whenever perception_mode="pointnet2" AND the current frame happens to have a
SemanticKITTI label_path (so a leave-in ground-truth check is possible),
controller.py feeds this evaluator the model's predictions for the sampled
points alongside the ground-truth class for those same points (collapsed to
the checkpoint's 3-class terrain/static/dynamic scheme via
perception.kitti_labels.to_checkpoint_taxonomy). This is a genuine, if
small-sample, per-frame accuracy check -- not the offline number restated.

Kept intentionally simple: a running 3x3 confusion matrix, updated
incrementally so memory stays O(1) regardless of how many frames have run.
"""

import numpy as np

CLASS_NAMES = ["terrain", "static", "dynamic"]
NUM_CLASSES = len(CLASS_NAMES)


class LiveAccuracyEvaluator:
    def __init__(self):
        # confusion[i, j] = count of points whose ground truth is class i
        # and whose prediction is class j.
        self.confusion = np.zeros((NUM_CLASSES, NUM_CLASSES), dtype=np.int64)
        self.frames_scored = 0
        self.points_scored = 0

    def reset(self):
        self.confusion[:] = 0
        self.frames_scored = 0
        self.points_scored = 0

    def update(self, predictions, ground_truth):
        """predictions, ground_truth: 1D int arrays of equal length, values
        in [0, NUM_CLASSES). Points where ground truth is out of that range
        are dropped (shouldn't happen given to_checkpoint_taxonomy's output,
        but defends against a mismatched-length or corrupt frame)."""
        predictions = np.asarray(predictions)
        ground_truth = np.asarray(ground_truth)
        n = min(len(predictions), len(ground_truth))
        if n == 0:
            return
        predictions, ground_truth = predictions[:n], ground_truth[:n]

        valid = (ground_truth >= 0) & (ground_truth < NUM_CLASSES) & \
                (predictions >= 0) & (predictions < NUM_CLASSES)
        if not np.any(valid):
            return
        predictions, ground_truth = predictions[valid], ground_truth[valid]

        idx = ground_truth * NUM_CLASSES + predictions
        counts = np.bincount(idx, minlength=NUM_CLASSES * NUM_CLASSES)
        self.confusion += counts.reshape(NUM_CLASSES, NUM_CLASSES)
        self.frames_scored += 1
        self.points_scored += int(len(predictions))

    def summary(self):
        if self.points_scored == 0:
            return {
                "frames_scored": 0,
                "points_scored": 0,
                "accuracy": None,
                "mean_iou": None,
                "class_iou": None,
                "confusion_matrix": self.confusion.tolist(),
                "class_names": CLASS_NAMES,
                "note": "No pointnet2-vs-ground-truth points scored yet -- "
                        "run perception_mode='pointnet2' on frames that have "
                        "a SemanticKITTI label_path.",
            }

        tp = np.diag(self.confusion).astype(float)
        pred_totals = self.confusion.sum(axis=0).astype(float)
        gt_totals = self.confusion.sum(axis=1).astype(float)
        union = gt_totals + pred_totals - tp

        with np.errstate(divide="ignore", invalid="ignore"):
            per_class_iou = np.where(union > 0, tp / union, np.nan)

        present = gt_totals > 0  # only score classes that actually appeared
        mean_iou = float(np.nanmean(per_class_iou[present])) if np.any(present) else None
        accuracy = float(tp.sum() / self.confusion.sum())

        class_iou = {
            CLASS_NAMES[i]: (None if np.isnan(per_class_iou[i]) else round(float(per_class_iou[i]), 4))
            for i in range(NUM_CLASSES)
        }

        return {
            "frames_scored": self.frames_scored,
            "points_scored": self.points_scored,
            "accuracy": round(accuracy, 4),
            "mean_iou": round(mean_iou, 4) if mean_iou is not None else None,
            "class_iou": class_iou,
            "confusion_matrix": self.confusion.tolist(),
            "class_names": CLASS_NAMES,
            "note": "Measured live against this repo's own SemanticKITTI "
                    "ground truth, frame by frame, as perception_mode="
                    "'pointnet2' runs -- not the checkpoint's own offline "
                    "training-time validation number (see /api/model/info).",
        }
