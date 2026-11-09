import time
import numpy as np
from preprocessing.pointcloud import preprocess
from perception.semantic import perceive
from perception.kitti_labels import KittiPerceptionBridge, load_label_file, to_checkpoint_taxonomy
from utility.information_value import current_information_value, future_expected_value
from utility.information_gain import estimate_information_gain
from utility.refinement_cost import estimate_refinement_cost
from evaluation.baseline import BaselineEngine
from evaluation.metrics import MetricsEvaluator
from evaluation.live_accuracy import LiveAccuracyEvaluator
from evaluation.distance_utility_probe import run_same_distance_probe
from evaluation.computational_benefit import ComputationalBenefitTracker
from evaluation.prediction_lead_time import PredictionLeadTimeTracker
from evaluation.prediction_recovery import PredictionRecoveryTracker
from evaluation.why_2_5d import why_2_5d_report
from evaluation.resource_flow import ResourceFlowLedger
from evaluation.region_decision_probe import run_region_decision_probe
from evaluation.controlled_experiment import run_controlled_experiment

class AdaptiveController:
    def __init__(self, config, map_manager, tracker, predictor, allocator):
        self.config = config
        self.map = map_manager
        self.tracker = tracker
        self.predictor = predictor
        self.allocator = allocator
        self.decision_log = []
        self.baseline = BaselineEngine(config)
        self.evaluator = MetricsEvaluator(config)
        self.live_accuracy = LiveAccuracyEvaluator()
        # D2/D3/D4: measured-demonstration accumulators. All three are
        # fed real per-frame data below in process_frame(); none of them
        # feed back into the actual allocation decision.
        self.computational_benefit = ComputationalBenefitTracker()
        self.lead_time = PredictionLeadTimeTracker(config)
        self.recovery = PredictionRecoveryTracker()
        # D6: real cross-frame resource-flow ledger -- fed from the exact
        # `applied` decisions list every frame, below.
        self.resource_flow = ResourceFlowLedger()
        self.kitti_bridge = KittiPerceptionBridge()
        self._pointnet2_perception = None
        # Set once _get_pointnet2_perception() has failed, so a missing
        # torch/checkpoint doesn't reattempt the (potentially slow) model
        # load on every single frame -- it fails fast after the first try.
        self._pointnet2_unavailable_error = None
        # Set once process_frame() has actually fallen back for this
        # session, so the console warning prints once instead of once per
        # frame (~7-10x/sec) while still processing every frame.
        self._pointnet2_fallback_warned = False

    def refresh_config(self, config):
        self.config = config
        self.allocator.config = config
        self.baseline.config = config
        self.evaluator.config = config
        self.lead_time.config = config

    def _get_pointnet2_perception(self):
        # Lazy: only imports torch / loads the checkpoint the first time
        # perception_mode="pointnet2" is actually used, so the default
        # ground_truth/generic path keeps working on machines without torch
        # installed or without the checkpoint present.
        if self._pointnet2_perception is None:
            if self._pointnet2_unavailable_error is not None:
                # Already failed once this session -- don't re-import torch
                # or re-attempt loading the checkpoint from disk every frame.
                raise RuntimeError(self._pointnet2_unavailable_error)
            from perception.pointnet2_semantic import PointNet2Perception
            try:
                self._pointnet2_perception = PointNet2Perception()
            except Exception as exc:
                self._pointnet2_unavailable_error = (
                    "perception_mode='pointnet2' requires torch and "
                    "checkpoints/pointnet2_foveamap.pth to be present and "
                    f"loadable ({type(exc).__name__}: {exc})"
                )
                raise RuntimeError(self._pointnet2_unavailable_error) from exc
        return self._pointnet2_perception

    def process_frame(self, lidar_frame, frame_id):
        t0 = time.perf_counter()

        label_path = lidar_frame.get("label_path")
        perception_mode = getattr(self.config, "perception_mode", "ground_truth")

        # Falling back out of pointnet2 mode is a local decision for THIS
        # frame only -- it deliberately does not mutate self.config, so
        # GET /api/config keeps reporting what was actually requested, and
        # a transient failure (e.g. a flaky checkpoint load) can't
        # permanently downgrade a session that might recover.
        pointnet2_failed = False
        if perception_mode == "pointnet2":
            try:
                # return_mask=True so that, if this frame ALSO has ground-
                # truth labels sitting next to it, we can filter the .label
                # file the exact same way and get a per-point ground truth
                # array aligned to the same points the model saw -- see the
                # accuracy scoring block below. This mirrors exactly how the
                # label_path branch (KittiPerceptionBridge.build) stays
                # aligned after filtering.
                points, point_mask = preprocess(lidar_frame, self.config, return_mask=True)
                perception = self._get_pointnet2_perception()
                scene = perception.perceive(points, self.config)

                # Opportunistic live accuracy check: only possible on frames
                # that happen to carry SemanticKITTI ground truth, and only
                # scores the points the model actually sampled+predicted on
                # (perception.last_sampled_idx / last_predictions), not the
                # whole scan.
                if label_path and perception.last_predictions is not None and len(perception.last_predictions):
                    try:
                        semantic_ids, _instance_ids = load_label_file(label_path)
                        n = min(len(point_mask), len(semantic_ids))
                        semantic_ids = semantic_ids[:n][point_mask[:n]]
                        semantic_ids = np.clip(semantic_ids, 0, 299).astype(np.int64)
                        if len(semantic_ids) == len(points):
                            gt_3class = to_checkpoint_taxonomy(semantic_ids)
                            gt_for_sampled = gt_3class[perception.last_sampled_idx]
                            self.live_accuracy.update(perception.last_predictions, gt_for_sampled)
                    except Exception as exc:
                        # Never let an accuracy side-check take down the actual
                        # demo frame -- log and move on.
                        print(f"[live_accuracy] skipped frame {frame_id}: {type(exc).__name__}: {exc}")
            except RuntimeError as exc:
                # Missing torch / missing or corrupt checkpoint. Before this
                # fallback existed, this propagated all the way up through
                # POST /api/frame as an unhandled 500 on EVERY frame -- i.e.
                # "Live Backend" mode would never show a single region on a
                # machine where pointnet2 wasn't fully set up, even though
                # ground_truth/generic perception works fine. Print once,
                # not once per frame (~7-10x/sec).
                if not self._pointnet2_fallback_warned:
                    print(f"[perception] pointnet2 unavailable, falling back to "
                          f"ground_truth/generic perception for this session "
                          f"(frame {frame_id}): {exc}")
                    self._pointnet2_fallback_warned = True
                pointnet2_failed = True

        if perception_mode != "pointnet2" or pointnet2_failed:
            if label_path:
                points, point_mask = preprocess(lidar_frame, self.config, return_mask=True)
                scene = self.kitti_bridge.build(points, label_path, lidar_frame.get("timestamp", 0.0), self.config, point_mask=point_mask)
            else:
                points = preprocess(lidar_frame, self.config)
                scene = perceive(points, lidar_frame.get("objects", []), self.config)

        self.map.update_observations(scene["regions"], frame_id)
        decayed = self.map.decay_stale_cells(frame_id, self.config.max_stale_frames)
        tracks = self.tracker.update(scene["dynamic_objects"])
        future = self.predictor.predict(tracks, self.config.prediction_horizon)
        self.map.update_future_signal(future)

        candidates = []
        for region in self.map.active_regions():
            iv = current_information_value(region, self.config)
            ev = future_expected_value(region, self.config)
            for transition in self.map.legal_transitions(region):
                ig = estimate_information_gain(region, transition, iv, ev, self.config)
                cost = estimate_refinement_cost(region, transition, self.config)
                utility = ig / max(cost, 1e-9)
                candidates.append({
                    "region_id": region.region_id,
                    "from_resolution": region.resolution,
                    "to_resolution": transition,
                    "ig": ig, "cost": cost, "utility": utility,
                    "signals": {
                        "S": region.semantic_importance,
                        "M": region.motion,
                        "U": region.uncertainty,
                        "G": region.geometry,
                        "D": region.distance_relevance,
                        "P_future": region.future_probability,
                        "IV_current": iv, "EV_future": ev
                    }
                })

        decisions = self.allocator.allocate(candidates, self.map)
        applied = self.map.apply_decisions(decisions, frame_id, self.config)
        self.map.reclaim_resources()

        # A4: Explainable "why did you refine this?" panel. `candidates`/
        # `applied` already carry every raw signal and the full IG/cost/
        # utility math -- nothing here is a new computation, just a
        # per-region lookup so a judge can click ANY active region
        # (including a low-value contrasting one, e.g. empty road, that
        # never appears in `applied` because nothing happened to it) and
        # see a single self-contained decision card instead of having to
        # cross-reference three separate lists by region_id.
        applied_by_id = {d["region_id"]: d for d in applied}
        best_candidate_by_id = {}
        for c in candidates:
            prev = best_candidate_by_id.get(c["region_id"])
            if prev is None or c["utility"] > prev["utility"]:
                best_candidate_by_id[c["region_id"]] = c

        explanations = {}
        for region in self.map.active_regions():
            best = best_candidate_by_id.get(region.region_id)
            applied_decision = applied_by_id.get(region.region_id)
            if applied_decision is not None:
                decision = "REFINE" if applied_decision["to_resolution"] < applied_decision["from_resolution"] else "COARSEN"
            else:
                # Had a candidate transition but it didn't clear the
                # refine/coarsen threshold or lost out on budget -- the
                # region's resolution simply stays where it is this frame.
                decision = "MAINTAIN"
            explanations[region.region_id] = {
                "region_id": region.region_id,
                "x": region.x, "y": region.y,
                "resolution": region.resolution,
                "semantic_class": region.semantic_class,
                "signals": {
                    "safety_semantic_relevance": region.semantic_importance,
                    "motion": region.motion,
                    "uncertainty": region.uncertainty,
                    "geometric_complexity": region.geometry,
                    "distance_context": region.distance_relevance,
                    "future_relevance": region.future_probability,
                },
                "expected_information_gain": best["ig"] if best else 0.0,
                "refinement_cost": best["cost"] if best else 0.0,
                "utility": best["utility"] if best else 0.0,
                "candidate_target_resolution": best["to_resolution"] if best else None,
                "decision": decision,
            }

        elapsed = time.perf_counter() - t0
        metrics = {
            "frame_id": frame_id,
            "processing_time_ms": elapsed * 1000,
            "fps": 1.0 / elapsed if elapsed else 0,
            "points_processed": len(points),
            "active_cells": self.map.active_cell_count(),
            "decayed_cells": len(decayed),
            "fine_cells": self.map.count_resolution(self.config.resolution_levels[-1]),
            "medium_cells": self.map.count_resolution(self.config.resolution_levels[-2]),
            "coarse_cells": self.map.count_resolution(self.config.resolution_levels[0]),
            "budget": self.config.computational_budget,
            "used_budget": self.map.active_cost,
            "remaining_budget": max(0, self.config.computational_budget - self.map.active_cost),
            "source_file": lidar_frame.get("source_file")
        }
        self.evaluator.record(metrics)
        self.decision_log.extend(applied)

        regions_serialized = self.map.serialize_active()

        # D2: accumulate this frame's real A3 baseline comparison into the
        # running experiment. Computed from the same regions/metrics this
        # frame already produced -- not a separate recomputation.
        baseline_result = self.baseline.compare({"regions": regions_serialized, "metrics": metrics})
        self.computational_benefit.record(baseline_result, regions_serialized, metrics)

        # D3: has any region that recently became a probable future
        # location for a track now actually been reached by that track?
        self.lead_time.update(tracks, self.map.active_regions(), future, frame_id)

        # D4: did any track's trajectory change (A2 uncertainty spike)
        # cause a different region to take over as its top future
        # candidate?
        self.recovery.update(tracks, future, explanations, frame_id)

        # D6: log this frame's real REFINE/COARSEN decisions into the
        # resource-flow ledger. `self.map.tree.nodes` (not
        # active_regions()) so a just-refined parent's x/y is still
        # readable even though apply_decisions() deactivated it above.
        self.resource_flow.record(applied, self.map.tree.nodes, frame_id)

        return {
            "frame_id": frame_id,
            "source_file": lidar_frame.get("source_file"),
            "points_processed": len(points),
            "objects": tracks,
            "future": future,
            "regions": regions_serialized,
            "candidates": sorted(candidates, key=lambda x: x["utility"], reverse=True)[:100],
            "decisions": applied,
            "explanations": explanations,
            "metrics": metrics
        }

    def serialize_state(self, result):
        return result or {"frame_id": 0, "regions": [], "objects": [], "decisions": [], "metrics": {}}

    def baseline_compare(self, result):
        return self.baseline.compare(result)

    def same_distance_probe(self, distance=15.0):
        """D1: proves distance isn't the primary resolution rule -- see
        evaluation/distance_utility_probe.py for the full method."""
        return run_same_distance_probe(self.config, distance)

    def computational_benefit_summary(self):
        """D2: measured proposed/uniform/distance-based comparison,
        accumulated across every frame processed since the last reset."""
        return self.computational_benefit.summary()

    def reset_computational_benefit(self):
        self.computational_benefit.reset()

    def prediction_timing_summary(self):
        """D3 + D4 combined: real lead-time-to-arrival events and
        prediction-failure/recovery events, both measured frame by frame
        as process_frame() runs -- see evaluation/prediction_lead_time.py
        and evaluation/prediction_recovery.py."""
        return {
            "lead_time": self.lead_time.summary(),
            "recovery": self.recovery.summary(),
        }

    def why_2_5d(self):
        """D5: real active-cell accounting vs a hypothetical dense 3D
        voxel grid at the same (x, y) resolution -- see
        evaluation/why_2_5d.py."""
        return why_2_5d_report(self.map, self.config)

    def resource_flow_summary(self):
        """D6: "Follow the Information" -- real cross-frame ledger of
        which COARSEN's freed budget actually funded which later REFINE,
        accumulated automatically as process_frame() runs -- see
        evaluation/resource_flow.py."""
        return self.resource_flow.summary()

    def region_decision_probe(self, position_scale=1.0):
        """D7: runs the real allocation pipeline against five archetypal
        regions (empty road, building, road edge/obstacle, moving
        vehicle, pedestrian) and reports each one's actual derived
        decision -- see evaluation/region_decision_probe.py."""
        return run_region_decision_probe(self.config, position_scale=position_scale)

    def controlled_experiment(self):
        """D8: consolidated, multi-trial judge-ready report combining D1
        and D7's probes run several times each, plus this session's own
        live D2 numbers -- see evaluation/controlled_experiment.py."""
        return run_controlled_experiment(self.config, self.computational_benefit_summary())

    def metrics_summary(self):
        return self.evaluator.summary()

    def accuracy_summary(self):
        """Live pointnet2-vs-ground-truth accuracy, plus the checkpoint's own
        offline validation numbers when available, clearly separated so the
        two are never confused with each other."""
        summary = self.live_accuracy.summary()
        summary["checkpoint"] = (
            self._pointnet2_perception.info() if self._pointnet2_perception is not None else None
        )
        return summary