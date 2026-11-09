from config import Config
from mapping.map_manager import MapManager
from allocation.budget_manager import BudgetManager


def _seed_region(mm, frame_id=0):
    mm.update_observations([{
        "x": 1.0, "y": 1.0, "z": 0.0, "occupancy": 0.9,
        "semantic_class": "car", "semantic_importance": 0.8,
        "motion": 0.7, "uncertainty": 0.6, "geometry": 0.5,
        "distance_relevance": 0.9,
    }], frame_id=frame_id)
    return mm.active_regions()[0]


def test_refine_wins_over_conflicting_coarsen_for_same_region():
    # A single region can legally produce both a qualifying coarsen
    # candidate and a qualifying refine candidate in the same frame (they
    # score different target resolutions). Previously BudgetManager applied
    # coarsen first unconditionally, apply_decisions() then silently
    # dropped the now-stale refine, and no cell ever reached a finer
    # resolution -- fine_cells stayed at 0 for the whole run.
    cfg = Config()
    mm = MapManager(cfg)
    bm = BudgetManager(cfg)
    region = _seed_region(mm)

    candidates = [
        {"region_id": region.region_id, "from_resolution": 0.5, "to_resolution": 0.2,
         "ig": 1.0, "cost": 1.0, "utility": 0.60},  # clears refine_threshold (0.55)
        {"region_id": region.region_id, "from_resolution": 0.5, "to_resolution": 1.0,
         "ig": 0.1, "cost": 1.0, "utility": 0.10},  # clears coarsen_threshold (0.25)
    ]

    decisions = bm.allocate(candidates, mm)
    applied = mm.apply_decisions(decisions, frame_id=1, config=cfg)

    actions = {a["action"] for a in applied}
    assert actions == {"REFINE"}, f"expected only the refine to apply, got {applied}"
    assert mm.count_resolution(0.2) == 4


def test_refine_reaches_finest_level_across_frames():
    cfg = Config()
    mm = MapManager(cfg)
    bm = BudgetManager(cfg)
    region = _seed_region(mm)

    decisions = bm.allocate([
        {"region_id": region.region_id, "from_resolution": 0.5, "to_resolution": 0.2,
         "ig": 1.0, "cost": 1.0, "utility": 0.9},
    ], mm)
    mm.apply_decisions(decisions, frame_id=1, config=cfg)

    medium = [c for c in mm.active_regions() if c.resolution == 0.2][0]
    decisions2 = bm.allocate([
        {"region_id": medium.region_id, "from_resolution": 0.2, "to_resolution": 0.05,
         "ig": 1.0, "cost": 1.0, "utility": 0.9},
    ], mm)
    mm.apply_decisions(decisions2, frame_id=2, config=cfg)

    assert mm.count_resolution(0.05) > 0


def test_unconflicted_coarsen_still_applies():
    # Make sure de-conflicting refine-vs-coarsen for the SAME region doesn't
    # accidentally suppress a coarsen that has no competing refine.
    cfg = Config()
    mm = MapManager(cfg)
    bm = BudgetManager(cfg)
    region = _seed_region(mm)

    candidates = [
        {"region_id": region.region_id, "from_resolution": 0.5, "to_resolution": 1.0,
         "ig": 0.1, "cost": 1.0, "utility": 0.10},
    ]
    decisions = bm.allocate(candidates, mm)
    applied = mm.apply_decisions(decisions, frame_id=1, config=cfg)

    assert [a["action"] for a in applied] == ["COARSEN"]