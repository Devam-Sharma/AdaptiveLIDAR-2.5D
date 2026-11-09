"""D8: Judge-Ready Controlled Experiment.

Ties the project's own demonstration probes into ONE consolidated,
repeatable report instead of a single cherry-picked run:

  - D1's same-distance probe (evaluation/distance_utility_probe.py) is run
    at several DIFFERENT shared distances, not just one, and the fraction
    of trials where the pedestrian and the same-distance static region
    genuinely received different decisions is reported.
  - D7's five-archetype probe (evaluation/region_decision_probe.py) is run
    at several different position scales (same relative geometry,
    different absolute distances), checking whether the archetypes'
    utility ranking the doc describes holds consistently rather than once.
  - Whatever this session's own D2 computational-benefit accumulator has
    measured live (evaluation/computational_benefit.py) is folded in
    as-is, so the report also reflects real, already-processed frames,
    not just these two synthetic probes.

Every number is produced by calling the real functions
(run_same_distance_probe / run_region_decision_probe) multiple times with
different inputs -- nothing here is a fixed/expected result asserted
without actually running the pipeline. All raw per-trial results are kept
in the returned report (not just pass/fail) so the team can defend any
individual number during judging.
"""
import time

from evaluation.distance_utility_probe import run_same_distance_probe
from evaluation.region_decision_probe import run_region_decision_probe

SAME_DISTANCE_TRIAL_DISTANCES = (5.0, 10.0, 15.0, 20.0, 25.0)
ARCHETYPE_POSITION_SCALES = (0.8, 1.0, 1.3)

# D7's doc-specified expected ordering -- checked against, not assumed
# into, each trial's actual utility numbers.
EXPECTED_UTILITY_ORDER = ["pedestrian", "vehicle", "road_edge_obstacle", "building", "empty_road"]


def _run_same_distance_trials(config):
    trials = []
    for d in SAME_DISTANCE_TRIAL_DISTANCES:
        result = run_same_distance_probe(config, distance=d)
        trials.append({
            "distance": d,
            "pedestrian_decision": result["pedestrian"]["decision"],
            "static_decision": result["static"]["decision"],
            "pedestrian_utility": result["pedestrian"]["utility"],
            "static_utility": result["static"]["utility"],
            "decisions_differ": result["decisions_differ"],
        })
    passed = sum(1 for t in trials if t["decisions_differ"])
    return {
        "trials": trials,
        "trial_count": len(trials),
        "passed_count": passed,
        "pass_rate": (passed / len(trials)) if trials else None,
        "definition": (
            "A trial passes if the pedestrian and the same-distance "
            "static region received DIFFERENT decisions (REFINE/MAINTAIN/"
            "COARSEN) -- proof distance alone didn't determine the "
            "outcome, checked at 5 different shared distances rather than "
            "one cherry-picked value."
        ),
    }


def _run_archetype_consistency_trials(config):
    trials = []
    for scale in ARCHETYPE_POSITION_SCALES:
        result = run_region_decision_probe(config, position_scale=scale)
        utility_by_key = {r["key"]: round(r["utility"], 4) for r in result["regions"]}
        actual_order = sorted(utility_by_key, key=lambda k: utility_by_key[k], reverse=True)
        trials.append({
            "position_scale": scale,
            "utility_by_key": utility_by_key,
            "actual_order": actual_order,
            "matches_expected_order": actual_order == EXPECTED_UTILITY_ORDER,
        })
    passed = sum(1 for t in trials if t["matches_expected_order"])
    return {
        "trials": trials,
        "trial_count": len(trials),
        "passed_count": passed,
        "pass_rate": (passed / len(trials)) if trials else None,
        "expected_order": EXPECTED_UTILITY_ORDER,
        "definition": (
            "A trial passes if the five archetypes' utility scores rank "
            "pedestrian >= vehicle > road edge/obstacle > building >= "
            "empty road, checked at 3 different position scales (same "
            "relative geometry, different absolute distances) so no "
            "single placement is cherry-picked."
        ),
    }


def run_controlled_experiment(config, computational_benefit_summary=None):
    same_distance = _run_same_distance_trials(config)
    archetype = _run_archetype_consistency_trials(config)
    return {
        "generated_at": time.time(),
        "same_distance_experiment": same_distance,
        "archetype_ordering_experiment": archetype,
        "live_computational_benefit": computational_benefit_summary,
        "note": (
            "Both synthetic experiments above run the real allocation "
            "pipeline multiple times with varied inputs rather than "
            "reporting one example -- see each experiment's own "
            "`definition` field for its pass/fail rule and `trials` for "
            "every individual run's raw numbers. live_computational_"
            "benefit (when present) reflects this session's own real "
            "processed frames, not a synthetic probe -- see evaluation/"
            "computational_benefit.py."
        ),
    }