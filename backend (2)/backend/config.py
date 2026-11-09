from dataclasses import dataclass, field

@dataclass
class Config:
    resolution_levels: list = field(default_factory=lambda: [0.50, 0.20, 0.05])
    # PS text calls for ~100m of coverage. This is (width, height) in metres,
    # centered on the sensor, so (100.0, 100.0) gives +-50m per axis. If the
    # PS specifically means a 100m RADIUS (200m across), bump this to
    # (200.0, 200.0) -- the quadtree (mapping/quadtree.py) is a sparse dict
    # keyed by touched cells, not a dense array, so widening this costs
    # nothing until points actually land out there. Previously (40.0, 30.0),
    # which undercut the PS's stated range for no algorithmic reason.
    map_dimensions: tuple = (100.0, 100.0)
    # 5000 is the value the demo actually runs at, and was previously applied by
    # hand via POST /api/config after every restart (the original default was
    # 160.0, which is far too small for a real KITTI scan -- the allocator has
    # no headroom and the map stays almost entirely coarse). Codified here so a
    # bare `python app.py` is demo-ready. Override with FOVEAMAP_BUDGET.
    computational_budget: float = 5000.0
    prediction_horizon: float = 2.0

    # Which perception path controller.py uses to turn points into regions:
    #   "ground_truth" - original/default behavior: the SemanticKITTI .label
    #                     bridge when the current frame has a label_path,
    #                     else the density-only generic fallback. Untouched,
    #                     proven, the demo-safe path if inference is flaky.
    #   "pointnet2"     - the trained PointNet++ checkpoint (see
    #                     perception/pointnet2_semantic.py) for every frame,
    #                     regardless of label_path. Requires torch and
    #                     checkpoints/pointnet2_foveamap.pth.
    perception_mode: str = "pointnet2"

    # Current/future value weights
    wS: float = 0.30
    wM: float = 0.20
    wU: float = 0.15
    wG: float = 0.15
    wD: float = 0.05
    wP: float = 0.15

    # IG weights
    aU: float = 0.20
    aS: float = 0.30
    aG: float = 0.15
    aM: float = 0.15
    aF: float = 0.20

    # Decision hysteresis
    refine_threshold: float = 0.55
    coarsen_threshold: float = 0.25
    min_dwell_frames: int = 2
    max_stale_frames: int = 5  # frames an active cell may go unobserved before it decays

    # Cost model
    k_compute: float = 0.20
    k_memory: float = 0.10
    k_points: float = 0.02
    hardware_multiplier: float = 1.0

    # Simulator
    simulation_dt: float = 0.20
    noise_std: float = 0.04
    point_density: int = 10
    random_seed: int = 7

    # Tracking/prediction
    process_noise: float = 0.15
    measurement_noise: float = 0.25
    prediction_sigma: float = 0.8

    # --- A1: Confidence-aware adaptation --------------------------------
    # Turns "how many times has this exact reading been confirmed" into a
    # real reduction of the uncertainty signal that already feeds
    # information_gain.py's aU term -- no separate refine/coarsen path, the
    # existing utility pipeline just sees a smaller number. See
    # MapManager.update_observations.
    #
    # An observation counts as "confirming" the cell (and extends its
    # stability streak) when its raw per-frame uncertainty is below this.
    # Above it, the region is still noisy/contested and the streak resets.
    confidence_stability_threshold: float = 0.35
    # Each additional confirming observation divides effective uncertainty
    # by roughly (1 + gain). E.g. gain=0.25 -> after 4 confirmations,
    # uncertainty is already reduced to ~50% of its raw value.
    confidence_stability_gain: float = 0.25
    # Streak length is capped so old confirmations can't make a region
    # immortal against ever refining again once something actually changes.
    confidence_stability_cap: int = 12
    # Effective uncertainty is never driven below this floor -- a cell is
    # never allowed to look "perfectly known" from repetition alone.
    confidence_min_uncertainty: float = 0.05

    # --- D5: Why 2.5D --------------------------------------------------
    # Assumed real-world vertical span (metres) that a dense 3D voxel grid
    # would need to cover at each active cell's (x, y) footprint, purely
    # for the accounting comparison in evaluation/why_2_5d.py. Not used
    # anywhere in the actual mapping/allocation pipeline -- this project
    # never builds that dense grid; the number only exists to show what it
    # WOULD have cost.
    vertical_extent_m: float = 3.0

    def update(self, data):
        for key, value in data.items():
            if hasattr(self, key):
                setattr(self, key, value)
        if "resolution_levels" in data:
            self.resolution_levels = sorted([float(x) for x in data["resolution_levels"]], reverse=True)

    def to_dict(self):
        return self.__dict__.copy()