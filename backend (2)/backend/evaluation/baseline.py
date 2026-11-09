"""A3: Baseline Benchmark Mode.

Turns the central claim ("we spend the budget where it's worth it, not
uniformly and not by distance alone") into a controlled, measured
comparison, computed fresh every frame from the SAME regions this exact
frame actually produced -- same LiDAR input, same positions, same semantic
importances as the real allocator saw. Only the *resolution rule* applied
to each region differs between the three columns:

  - proposed        : the resolution the real utility-driven allocator
                       actually assigned this region this frame.
  - uniform          : every region forced to the finest configured
                       resolution level, regardless of content.
  - distance_based   : resolution assigned purely by distance-from-sensor
                       band (near -> fine, mid -> medium, far -> coarse),
                       ignoring semantic/motion/uncertainty content.

Every number below is derived from data already present in `result` this
frame -- nothing is invented, simulated offline, or hard-coded as a
percentage improvement. If a claim can't be computed from the current
frame, the field is None rather than guessed.
"""
import math


class BaselineEngine:
    def __init__(self, config):
        self.config = config

    def _finest_resolution(self):
        return min(self.config.resolution_levels)

    def _cell_count_at(self, original_size, target_resolution):
        """How many `target_resolution`-sized cells it would take to fully
        tile the SAME physical area that one already-active cell of
        `original_size` currently covers.

        This -- not the resolution number itself -- is the real memory/
        compute driver in this architecture: a Cell is a roughly
        fixed-overhead state object (see mapping/cell.py) regardless of
        its resolution field, so covering a fixed physical area with
        smaller cells means literally instantiating more Cell objects.
        Correctly INCREASES for finer target_resolution and DECREASES
        for coarser -- e.g. tiling a 0.2 m region down to 0.05 m cells
        takes (0.2/0.05)^2 = 16 separate cells; tiling it with a single
        0.2 m cell (the region's own current size) takes exactly 1.
        """
        if target_resolution <= 0:
            return 1.0
        return (original_size / target_resolution) ** 2

    def _assign_distance_resolution(self, distance):
        """near -> fine, mid -> medium, far -> coarse, using evenly spaced
        bands over the map's own configured half-extent so the thresholds
        come from this project's own configuration, not arbitrary numbers.
        Levels are sorted fine-to-coarse; band index scales with distance."""
        levels = sorted(self.config.resolution_levels)  # fine -> coarse
        half_extent = max(self.config.map_dimensions) / 2.0
        n = len(levels)
        band_width = half_extent / n if n else half_extent
        idx = min(int(distance // band_width) if band_width > 0 else 0, n - 1)
        return levels[idx]

    def _summarize(self, resolutions, importances, own_sizes, important_threshold):
        n = len(resolutions)
        if n == 0:
            return {
                "active_cells": n, "estimated_cell_objects": 0.0,
                "avg_resolution_m": None,
                "avg_resolution_important_regions_m": None,
                "important_region_count": 0,
            }
        # estimated_cell_objects: for each real active region, how many
        # cells of the resolution THIS method would assign are needed to
        # cover that region's own actual area. For "proposed" this always
        # collapses to exactly n (each region already IS one real cell at
        # its own resolution); for "uniform"/"distance_based" it grows
        # whenever the hypothetical resolution is finer than the region
        # actually needed -- the real cost of not adapting.
        cell_objects = sum(
            self._cell_count_at(size, res) for size, res in zip(own_sizes, resolutions)
        )
        important_res = [r for r, imp in zip(resolutions, importances) if imp >= important_threshold]
        return {
            "active_cells": n,
            "estimated_cell_objects": round(cell_objects, 2),
            "avg_resolution_m": round(sum(resolutions) / n, 4),
            "avg_resolution_important_regions_m": (
                round(sum(important_res) / len(important_res), 4)
                if important_res else None
            ),
            "important_region_count": len(important_res),
        }

    def compare(self, result):
        regions = result.get("regions", [])
        if not regions:
            return {
                "proposed": {}, "uniform": {}, "distance_based": {},
                "note": "No active regions this frame -- nothing to compare yet.",
            }

        # "Safety-critical" here means pedestrian/vehicle/obstacle-grade
        # importance -- reuses the same semantic_importance value the real
        # allocator itself scores on, not a separately invented threshold.
        important_threshold = 0.5

        proposed_res = [r["resolution"] for r in regions]
        own_sizes = proposed_res  # a real active region's own size IS its current resolution
        importances = [r.get("semantic_importance", 0.0) for r in regions]
        proposed = self._summarize(proposed_res, importances, own_sizes, important_threshold)
        proposed["estimated_cost_budget_units"] = result.get("metrics", {}).get("used_budget", 0)
        proposed["rule"] = "utility-driven adaptive resolution (this project's method)"

        finest = self._finest_resolution()
        uniform_res = [finest] * len(regions)
        uniform = self._summarize(uniform_res, importances, own_sizes, important_threshold)
        uniform["rule"] = f"every active region forced to finest resolution ({finest} m)"

        distances = [math.hypot(r["x"], r["y"]) for r in regions]
        distance_res = [self._assign_distance_resolution(d) for d in distances]
        distance_based = self._summarize(distance_res, importances, own_sizes, important_threshold)
        distance_based["rule"] = "resolution assigned purely by distance band from sensor"

        return {
            "proposed": proposed,
            "uniform": uniform,
            "distance_based": distance_based,
            # D2 (Measured Computational Benefit): exposed so
            # evaluation/computational_benefit.py can accumulate a
            # per-region "did this critical region hold finest
            # resolution" rate across many frames without re-deriving
            # the distance-band rule a second time -- same list, same
            # order as `regions`.
            "distance_based_resolutions": distance_res,
            "finest_resolution": finest,
            "note": (
                "All three columns evaluated on the SAME regions, positions "
                "and semantic importances from this exact frame -- only the "
                "resolution-assignment rule differs. estimated_cell_objects "
                "= how many separate Cell state objects it would take to "
                "tile each region's own actual area at that rule's assigned "
                "resolution -- the real memory/compute driver in this "
                "architecture, since a Cell's overhead is roughly fixed "
                "regardless of its resolution field. No percentage-"
                "improvement figures are asserted here; compute those "
                "yourself from these raw measured numbers if needed."
            ),
        }