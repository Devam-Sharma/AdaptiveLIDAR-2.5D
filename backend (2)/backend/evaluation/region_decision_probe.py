"""D7: Region-by-Region Decision Explanation.

Places five archetypal regions -- empty road, building, road edge/
obstacle, a moving vehicle, and a pedestrian -- in one scene and runs the
exact same real pipeline controller.py runs every frame
(update_observations -> Tracker.update -> FuturePredictor.predict ->
update_future_signal -> current_information_value() / future_expected_
value() / estimate_information_gain() / estimate_refinement_cost() /
BudgetManager.allocate(), all imported directly, not re-implemented) to
derive each region's actual decision.

The doc's expected pattern -- empty road and buildings stay coarse unless
another signal raises them; an edge/obstacle's uncertainty or geometry
alone can justify medium/fine detail; a moving vehicle's motion + semantic
+ future relevance can justify refine; a pedestrian's safety relevance
stacks on top of that for the highest utility -- is a DESCRIPTION of what
the scoring formula should produce, not something this probe hard-codes.
Every value below is read back from the real Cell/candidate objects after
allocate() actually ran.
"""
import math

from mapping.map_manager import MapManager
from tracking.tracker import Tracker
from prediction.future_occupancy import FuturePredictor
from allocation.budget_manager import BudgetManager
from utility.information_value import current_information_value, future_expected_value
from utility.information_gain import estimate_information_gain
from utility.refinement_cost import estimate_refinement_cost


ARCHETYPES = [
    {
        "key": "empty_road", "label": "Empty road",
        "x": 20.0, "y": 0.0, "semantic_class": "road", "semantic_importance": 0.05,
        "occupancy": 0.9, "motion": 0.0, "uncertainty": 0.05, "geometry": 0.02,
        "dynamic": False,
    },
    {
        "key": "building", "label": "Building",
        "x": 0.0, "y": 16.0, "semantic_class": "building", "semantic_importance": 0.2,
        "occupancy": 0.95, "motion": 0.0, "uncertainty": 0.05, "geometry": 0.4,
        "dynamic": False,
    },
    {
        "key": "road_edge_obstacle", "label": "Road edge / obstacle",
        "x": -14.0, "y": 6.0, "semantic_class": "obstacle", "semantic_importance": 0.35,
        "occupancy": 0.6, "motion": 0.0, "uncertainty": 0.5, "geometry": 0.6,
        "dynamic": False,
    },
    {
        "key": "vehicle", "label": "Moving vehicle",
        "x": 12.0, "y": -10.0, "semantic_class": "vehicle", "semantic_importance": 0.75,
        "occupancy": 0.85, "motion": 0.6, "uncertainty": 0.3, "geometry": 0.3,
        "dynamic": True, "vx": 4.0, "vy": 0.0,
    },
    {
        "key": "pedestrian", "label": "Pedestrian",
        "x": -6.0, "y": -18.0, "semantic_class": "pedestrian", "semantic_importance": 1.0,
        "occupancy": 0.8, "motion": 0.8, "uncertainty": 0.35, "geometry": 0.3,
        "dynamic": True, "vx": 1.2, "vy": 0.6,
    },
]


def run_region_decision_probe(config, position_scale=1.0):
    """`position_scale` scales every archetype's (x, y) by the same
    factor -- used by D8's controlled experiment to re-run this probe at
    several different absolute distances (same relative geometry) rather
    than relying on one fixed placement."""
    mm = MapManager(config)
    tracker = Tracker(config)
    predictor = FuturePredictor(config)
    allocator = BudgetManager(config)

    observations = []
    dynamic_objects = []
    positions = {}
    for a in ARCHETYPES:
        x, y = a["x"] * position_scale, a["y"] * position_scale
        positions[a["key"]] = (x, y)
        distance_relevance = 1.0 / (1.0 + math.hypot(x, y))
        observations.append({
            "x": x, "y": y, "z": 0.0, "occupancy": a["occupancy"],
            "semantic_class": a["semantic_class"], "semantic_importance": a["semantic_importance"],
            "motion": a["motion"], "uncertainty": a["uncertainty"], "geometry": a["geometry"],
            "distance_relevance": distance_relevance,
        })
        if a["dynamic"]:
            dynamic_objects.append({
                "track_id": a["key"], "class": a["semantic_class"],
                "x": x, "y": y, "vx": a["vx"], "vy": a["vy"],
            })

    mm.update_observations(observations, frame_id=0)
    # Real tracking + prediction for the two dynamic archetypes --
    # future_probability below is derived from this, not asserted.
    tracks = tracker.update(dynamic_objects)
    future = predictor.predict(tracks, config.prediction_horizon)
    mm.update_future_signal(future)

    # Snapshot BEFORE apply_decisions() can deactivate a parent region it
    # refines (see distance_utility_probe.py for why this snapshot has to
    # happen now, not after).
    snapshots = {}
    for a in ARCHETYPES:
        x, y = positions[a["key"]]
        region = mm.tree.locate_cell(x, y)
        snapshots[a["key"]] = {
            "region_id": region.region_id, "x": x, "y": y,
            "resolution_before": region.resolution,
        }

    candidates = []
    for region in mm.active_regions():
        iv = current_information_value(region, config)
        ev = future_expected_value(region, config)
        for transition in mm.legal_transitions(region):
            ig = estimate_information_gain(region, transition, iv, ev, config)
            cost = estimate_refinement_cost(region, transition, config)
            utility = ig / max(cost, 1e-9)
            candidates.append({
                "region_id": region.region_id,
                "from_resolution": region.resolution, "to_resolution": transition,
                "ig": ig, "cost": cost, "utility": utility,
            })

    decisions = allocator.allocate(candidates, mm)
    applied = mm.apply_decisions(decisions, 0, config)
    applied_by_id = {d["region_id"]: d for d in applied}
    best_by_id = {}
    for c in candidates:
        prev = best_by_id.get(c["region_id"])
        if prev is None or c["utility"] > prev["utility"]:
            best_by_id[c["region_id"]] = c

    def describe(archetype):
        snap = snapshots[archetype["key"]]
        best = best_by_id.get(snap["region_id"])
        applied_decision = applied_by_id.get(snap["region_id"])
        if applied_decision is not None:
            decision = "REFINE" if applied_decision["to_resolution"] < applied_decision["from_resolution"] else "COARSEN"
            resulting_resolution = applied_decision["to_resolution"]
        else:
            decision = "MAINTAIN"
            resulting_resolution = snap["resolution_before"]
        live_cell = mm.tree.locate_cell(snap["x"], snap["y"])
        return {
            "key": archetype["key"], "label": archetype["label"],
            "region_id": snap["region_id"], "semantic_class": archetype["semantic_class"],
            "resolution_before": snap["resolution_before"], "resolution_after": resulting_resolution,
            "signals": {
                "safety_semantic_relevance": live_cell.semantic_importance,
                "motion": live_cell.motion,
                "uncertainty": live_cell.uncertainty,
                "geometric_complexity": live_cell.geometry,
                "distance_context": live_cell.distance_relevance,
                "future_relevance": live_cell.future_probability,
            },
            "expected_information_gain": best["ig"] if best else 0.0,
            "refinement_cost": best["cost"] if best else 0.0,
            "utility": best["utility"] if best else 0.0,
            "decision": decision,
        }

    results = [describe(a) for a in ARCHETYPES]

    return {
        "position_scale": position_scale,
        "regions": results,
        "claim": (
            "All five regions ran through the exact same "
            "current_information_value() / future_expected_value() / "
            "estimate_information_gain() / estimate_refinement_cost() / "
            "BudgetManager.allocate() functions controller.py calls every "
            "real frame -- the decisions above are read back from that "
            "run, not hard-coded to match the expected pattern."
        ),
    }