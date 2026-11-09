"""D2: Measured Computational Benefit.

A3's BaselineEngine (evaluation/baseline.py) already measures, on a SINGLE
frame, how proposed/uniform/distance-based resolution assignment compare
on that frame's real regions. D2 asks for something slightly different:
"run the same scene under a controlled computational budget" and report
real measurements accumulated over a run, not one frame's snapshot.

This module accumulates exactly the numbers baseline.py already computed
each frame into running averages, plus one additional measurement
baseline.py doesn't track on its own: a perception-preservation proxy --
across every safety-critical region actually seen (semantic_importance
>= 0.5, the same threshold baseline.py itself uses), what fraction of the
time each method's resolution rule would have kept that region at finest
resolution. Nothing here is recomputed or invented -- every value comes
from a `compare()` result and the real region list for that same frame.
"""
from collections import defaultdict

IMPORTANT_THRESHOLD = 0.5
METHODS = ("proposed", "uniform", "distance_based")
TRACKED_FIELDS = ("estimated_cell_objects", "active_cells", "avg_resolution_m")


class ComputationalBenefitTracker:
    def __init__(self):
        self.reset()

    def reset(self):
        self.frames_measured = 0
        self._sums = defaultdict(lambda: defaultdict(float))
        self._critical_total = 0
        self._critical_fine = defaultdict(int)

    def record(self, baseline_result, regions, metrics):
        """`baseline_result` is BaselineEngine.compare()'s return value for
        THIS frame, `regions` is the exact same region list that was
        passed into it (same order), `metrics` is this frame's own
        controller.py metrics dict."""
        if not baseline_result or not regions:
            return
        proposed = baseline_result.get("proposed")
        if not proposed:
            # baseline.py's own "no active regions this frame" placeholder.
            return

        self.frames_measured += 1
        for method in METHODS:
            row = baseline_result.get(method) or {}
            for field in TRACKED_FIELDS:
                v = row.get(field)
                if v is not None:
                    self._sums[method][field] += v

        finest = baseline_result.get("finest_resolution")
        distance_res = baseline_result.get("distance_based_resolutions") or []
        for region, d_res in zip(regions, distance_res):
            importance = region.get("semantic_importance", 0.0)
            if importance < IMPORTANT_THRESHOLD:
                continue
            self._critical_total += 1
            res = region.get("resolution")
            if finest is None or res is None:
                continue
            if abs(res - finest) < 1e-9:
                self._critical_fine["proposed"] += 1
            # uniform forces finest everywhere by construction.
            self._critical_fine["uniform"] += 1
            if d_res is not None and abs(d_res - finest) < 1e-9:
                self._critical_fine["distance_based"] += 1

    def summary(self):
        if self.frames_measured == 0:
            return {
                "frames_measured": 0,
                "critical_regions_observed": 0,
                "methods": {},
                "note": "No frames measured yet -- run some frames first.",
            }
        methods = {}
        for method in METHODS:
            fields = self._sums.get(method, {})
            methods[method] = {
                f"avg_{k}": (fields.get(k, 0.0) / self.frames_measured) for k in TRACKED_FIELDS
            }
            methods[method]["critical_region_fine_resolution_rate"] = (
                self._critical_fine[method] / self._critical_total
                if self._critical_total else None
            )
        return {
            "frames_measured": self.frames_measured,
            "critical_regions_observed": self._critical_total,
            "methods": methods,
            "note": (
                "Running averages accumulated across every frame measured "
                "since the last reset (POST /api/demo/computational_benefit/"
                "reset) -- not a single-frame snapshot. "
                "critical_region_fine_resolution_rate = fraction of "
                "safety-critical region-observations (semantic_importance "
                "\u2265 0.5) that would have held finest resolution under "
                "that method, computed from the exact resolutions each "
                "method actually assigned that region that frame."
            ),
        }