"""D4: Prediction Failure and Recovery -- measurable demonstration.

tracking/tracker.py already computes a real, per-track `uncertainty` that
spikes when a track's own one-step-ahead forecast turns out wrong (A2).
This module watches for that spike and turns it into the specific
before/after evidence D4 asks for:

  1. When a track's uncertainty crosses a "trajectory changed" threshold,
     snapshot which currently-active region is that track's #1 future
     candidate right now (via controller.py's A4 `explanations`, so the
     utility number is the SAME one the allocator itself used, not
     re-derived) -- this is the "old candidate region", losing relevance.
  2. On every following frame, keep that old region's utility fresh (so
     the fall can actually be shown) and check whether a DIFFERENT region
     has taken over as the track's #1 future candidate.
  3. Once a genuinely different region takes over, close the event with
     both regions' utility values and the elapsed frame count.

This does not re-run the allocator or invent a parallel utility formula --
`explanations[region_id]["utility"]` is the exact number controller.py's
real candidate-building loop produced that frame.
"""
import math
from collections import deque

FAILURE_UNCERTAINTY_THRESHOLD = 0.6  # tracker.py's MAX_UNCERTAINTY is 0.95, BASE is 0.20
RESTABILIZED_UNCERTAINTY_THRESHOLD = 0.3


class PredictionRecoveryTracker:
    def __init__(self, max_log=15):
        self.max_log = max_log
        self._open = {}  # track_id -> open event dict
        self.log = deque(maxlen=max_log)

    def reset(self):
        self._open.clear()
        self.log.clear()

    def _top_future_region(self, track_id, future, explanations):
        """Which currently-active region is this track's #1 future
        candidate right now, using the SAME future-occupancy candidates
        (prediction/future_occupancy.py) and the SAME per-region utility
        A4's explanations already computed."""
        best_region_id, best_score = None, -1.0
        for f in future:
            if f["track_id"] != track_id:
                continue
            sigma = max(f.get("sigma", 0.25), 0.25)
            weight = f.get("probability", 1.0)
            for region_id, ex in explanations.items():
                d = math.hypot(ex["x"] - f["x"], ex["y"] - f["y"])
                score = weight * math.exp(-(d * d) / (2 * sigma * sigma))
                if score > best_score:
                    best_score, best_region_id = score, region_id
        if best_region_id is None:
            return None
        ex = explanations[best_region_id]
        return {"region_id": best_region_id, "x": ex["x"], "y": ex["y"], "utility": ex["utility"]}

    def update(self, tracks, future, explanations, frame_id):
        for tr in tracks:
            tid = tr["track_id"]
            uncertainty = tr.get("uncertainty", 0.0)
            open_ev = self._open.get(tid)

            if open_ev is None:
                if uncertainty >= FAILURE_UNCERTAINTY_THRESHOLD:
                    old_top = self._top_future_region(tid, future, explanations)
                    if old_top:
                        self._open[tid] = {
                            "track_id": tid,
                            "trigger_frame": frame_id,
                            "old_region_id": old_top["region_id"],
                            "old_region_x": old_top["x"], "old_region_y": old_top["y"],
                            "old_region_utility_before": old_top["utility"],
                            "old_region_utility_now": old_top["utility"],
                        }
                continue

            old_ex = explanations.get(open_ev["old_region_id"])
            if old_ex is not None:
                open_ev["old_region_utility_now"] = old_ex["utility"]

            new_top = self._top_future_region(tid, future, explanations)
            if new_top and new_top["region_id"] != open_ev["old_region_id"]:
                self.log.appendleft({
                    "track_id": tid,
                    "trigger_frame": open_ev["trigger_frame"],
                    "resolved_frame": frame_id,
                    "frames_to_recover": frame_id - open_ev["trigger_frame"],
                    "old_region_id": open_ev["old_region_id"],
                    "old_region_utility_before": open_ev["old_region_utility_before"],
                    "old_region_utility_after": open_ev["old_region_utility_now"],
                    "new_region_id": new_top["region_id"],
                    "new_region_x": new_top["x"], "new_region_y": new_top["y"],
                    "new_region_utility": new_top["utility"],
                })
                del self._open[tid]
            elif uncertainty < RESTABILIZED_UNCERTAINTY_THRESHOLD:
                # Track settled back down without a distinct region ever
                # taking over (e.g. it returned to its original heading) --
                # stop watching, there's nothing to report for this one.
                del self._open[tid]

    def summary(self):
        return {
            "events": list(self.log),
            "open_watch_count": len(self._open),
            "note": (
                "An event fires when a track's own measured prediction "
                "uncertainty (tracking/tracker.py, A2) spikes past "
                f"{FAILURE_UNCERTAINTY_THRESHOLD} and a DIFFERENT region "
                "later takes over as that track's top future-relevance "
                "candidate. Utility values are the real numbers from "
                "controller.py's A4 explanations, not re-derived."
            ),
        }