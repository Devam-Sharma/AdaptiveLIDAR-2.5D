// src/utils/simulatedDemo.js
// Client-side synthetic data generators that mirror the shapes returned by the
// live backend, so every A2/A3/D1/D2/D3/D4/D5/D7/D8 panel renders real-looking
// content in Simulated Demo mode instead of a "switch to Live Backend" note.

function jitter(base, amp, tick, phase = 0) {
  return base + Math.sin(tick * 0.6 + phase) * amp;
}
function round(v, d = 2) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}
const decide = (u) => (u > 1.8 ? "REFINE" : u > 1.08 ? "MAINTAIN" : "COARSEN");

// --- Prediction page --------------------------------------------------------

export function simPredictionError(tick = 0) {
  const tracks = [
    { id: "veh-1", name: "Moving Vehicle #1", base: 0.14, unc: 0.22, phase: 0 },
    { id: "ped-1", name: "Pedestrian #1", base: 0.41, unc: 0.55, phase: 1.3 },
    { id: "cyc-1", name: "Cyclist #1", base: 0.19, unc: 0.3, phase: 2.1 },
  ];
  return tracks.map((t) => ({
    id: t.id,
    name: t.name,
    kind: "dynamic",
    predictionError: round(Math.max(0.02, jitter(t.base, 0.08, tick, t.phase)), 2),
    uncertainty: round(Math.max(0.05, jitter(t.unc, 0.12, tick, t.phase + 0.7)), 2),
  }));
}

export function simFutureCandidates(tick = 0) {
  const spread = 0.5 + 0.4 * Math.abs(Math.sin(tick * 0.4));
  const mk = (id, cls, x, y, vx, vy, unc, dir, straight) => {
    const left = round(Math.max(0, (1 - straight) * (0.55 + 0.1 * Math.sin(tick))), 2);
    const right = round(Math.max(0, 1 - straight - left), 2);
    return {
      obj: { track_id: id, class: cls, x, y, vx, vy, uncertainty: unc, direction: dir },
      fut: [
        { track_id: id, candidate: "straight", probability: straight },
        { track_id: id, candidate: "left", probability: left },
        { track_id: id, candidate: "right", probability: right },
      ],
    };
  };
  const s1 = round(0.72 - 0.18 * spread, 2);
  const s2 = round(0.55 - 0.12 * spread, 2);
  const a = mk("veh-1", "vehicle", 12.4, 8.1, 7.9, 0.3, 0.05, 0.05, s1);
  const b = mk("ped-1", "pedestrian", -3.2, 5.6, 0.4, 1.1, 0.45, 1.2, s2);
  return { objects: [a.obj, b.obj], future: [...a.fut, ...b.fut] };
}

export function simPredictionTiming(tick = 0) {
  const n = Math.min(8, 6 + (tick % 3));
  const events = Array.from({ length: n }, (_, i) => ({
    track_id: `trk-${i + 1}`,
    region_id: `R${40 + i}`,
    predicted_frame: 7100 + i * 7,
    arrival_frame: 7100 + i * 7 + 11 + (i % 3),
    lead_time_seconds: round(1.1 + (i % 3) * 0.35 + Math.sin(tick + i) * 0.05, 2),
  }));
  const avg = events.reduce((s, e) => s + e.lead_time_seconds, 0) / events.length;
  return {
    lead_time: {
      measured_event_count: events.length,
      average_lead_time_seconds: round(avg, 2),
      events,
      note: "Simulated lead time between the frame a region was first predicted relevant and the frame the object actually arrived there.",
    },
    recovery: {
      open_watch_count: 1 + (tick % 3),
      events: Array.from({ length: 3 }, (_, i) => ({
        track_id: `trk-${i + 1}`,
        resolved_frame: 7120 + i * 9,
        frames_to_recover: 3 + (i % 3),
        old_region_id: `R${40 + i}`,
        old_region_utility_before: round(2.1 - i * 0.2, 2),
        old_region_utility_after: round(0.7 + i * 0.1, 2),
        new_region_id: `R${50 + i}`,
        new_region_utility: round(2.3 - i * 0.15, 2),
      })),
      note: "Simulated: when a track's real trajectory deviates from its forecast, the old region's utility collapses and a new region picks the budget up within a few frames.",
    },
  };
}

// --- Comparison page --------------------------------------------------------

export function simBaseline(tick = 0) {
  const active = 168 + (tick % 6);
  return {
    proposed: {
      active_cells: active,
      estimated_cell_objects: 4200 + Math.round(jitter(0, 40, tick)),
      avg_resolution_m: 0.28,
      avg_resolution_important_regions_m: 0.07,
      important_region_count: 3,
    },
    uniform: {
      active_cells: active,
      estimated_cell_objects: 11040,
      avg_resolution_m: 0.05,
      avg_resolution_important_regions_m: 0.05,
      important_region_count: 3,
    },
    distance_based: {
      active_cells: active,
      estimated_cell_objects: 7360,
      avg_resolution_m: 0.16,
      avg_resolution_important_regions_m: 0.19,
      important_region_count: 3,
    },
    note: "Simulated snapshot: the proposed allocator concentrates its budget on the important regions, so it needs far fewer estimated cell-objects than uniform-fine while keeping the critical regions sharp.",
  };
}

export function simSameDistance(distance = 15) {
  const d = Number(distance) || 15;
  const pedUtility = round(2.4 - d * 0.02, 3);
  const staticUtility = round(0.9 - d * 0.015, 3);
  return {
    pedestrian: {
      semantic_class: "pedestrian",
      distance_from_sensor: round(d, 2),
      resolution_before: 0.2,
      resolution_after: decide(pedUtility) === "REFINE" ? 0.05 : 0.2,
      utility: pedUtility,
      decision: decide(pedUtility),
    },
    static: {
      semantic_class: "road_surface",
      distance_from_sensor: round(d, 2),
      resolution_before: 0.2,
      resolution_after: decide(staticUtility) === "COARSEN" ? 0.5 : 0.2,
      utility: staticUtility,
      decision: decide(staticUtility),
    },
    distance_is_identical: true,
    decisions_differ: decide(pedUtility) !== decide(staticUtility),
    claim: "Simulated: both regions sit at exactly the same distance, yet the pedestrian earns a finer resolution because information value — not distance — drives the decision.",
  };
}

export function simComputationalBenefit(frames = 24) {
  const f = Math.max(1, frames);
  return {
    frames_measured: f,
    critical_regions_observed: Math.round(f * 1.4),
    methods: {
      proposed: {
        avg_estimated_cell_objects: 4180,
        avg_active_cells: 172.4,
        avg_avg_resolution_m: 0.28,
        critical_region_fine_resolution_rate: 0.94,
      },
      uniform: {
        avg_estimated_cell_objects: 11020,
        avg_active_cells: 172.4,
        avg_avg_resolution_m: 0.05,
        critical_region_fine_resolution_rate: 1.0,
      },
      distance_based: {
        avg_estimated_cell_objects: 7340,
        avg_active_cells: 172.4,
        avg_avg_resolution_m: 0.16,
        critical_region_fine_resolution_rate: 0.61,
      },
    },
    note: "Simulated running experiment: averaged across processed frames, the proposed allocator uses ~62% fewer cell-objects than uniform-fine while keeping 94% of critical regions at the finest resolution.",
  };
}

export function simWhy25D(tick = 0) {
  const active = 172 + (tick % 5);
  const voxelRatio = 42.5;
  return {
    active_cell_count: active,
    dense_3d_equivalent_voxel_count: Math.round(active * voxelRatio),
    voxel_to_cell_ratio: voxelRatio,
    example_cells: [
      { region_id: "R41", resolution: 0.05, elevation: 0.12, occupancy: 0.91, semantic_class: "pedestrian", motion: 0.62, uncertainty: 0.34 },
      { region_id: "R44", resolution: 0.2, elevation: 0.02, occupancy: 0.18, semantic_class: "road_surface", motion: 0.0, uncertainty: 0.08 },
      { region_id: "R52", resolution: 0.05, elevation: 0.35, occupancy: 0.87, semantic_class: "vehicle", motion: 0.79, uncertainty: 0.22 },
      { region_id: "R58", resolution: 0.5, elevation: 1.9, occupancy: 0.96, semantic_class: "building", motion: 0.0, uncertainty: 0.05 },
    ],
    explanation: "Simulated: each active cell stores elevation + occupancy + semantic + motion + uncertainty for one surface footprint. A dense 3D voxel grid at the same ground resolution would need ~42x more entries to describe the same scene.",
  };
}

export function simRegionDecisions() {
  const mk = (key, label, semantic_class, utility, resBefore, resAfter, signals) => ({
    key, label, semantic_class, utility,
    resolution_before: resBefore, resolution_after: resAfter,
    decision: decide(utility), signals,
  });
  return {
    regions: [
      mk("ped", "Pedestrian Corridor", "pedestrian", 2.41, 0.2, 0.05, { safety_semantic_relevance: 0.95, motion: 0.58, uncertainty: 0.42, geometric_complexity: 0.36, future_relevance: 0.79 }),
      mk("veh", "Moving Vehicle", "vehicle", 1.92, 0.2, 0.05, { safety_semantic_relevance: 0.83, motion: 0.79, uncertainty: 0.3, geometric_complexity: 0.46, future_relevance: 0.6 }),
      mk("barrier", "Road Barrier", "barrier", 1.34, 0.2, 0.2, { safety_semantic_relevance: 0.6, motion: 0.0, uncertainty: 0.12, geometric_complexity: 0.5, future_relevance: 0.2 }),
      mk("curb", "Road Edge / Curb", "curb", 1.12, 0.2, 0.2, { safety_semantic_relevance: 0.45, motion: 0.0, uncertainty: 0.1, geometric_complexity: 0.4, future_relevance: 0.15 }),
      mk("empty", "Empty Road", "road_surface", 0.74, 0.2, 0.5, { safety_semantic_relevance: 0.2, motion: 0.0, uncertainty: 0.06, geometric_complexity: 0.15, future_relevance: 0.05 }),
    ],
    claim: "Simulated: five archetypal regions scored through the same weighted utility formula. Semantic relevance and motion push the pedestrian and vehicle to REFINE; the empty road is safely COARSENED to reclaim budget.",
  };
}

export function simControlledExperiment(framesMeasured = 24) {
  const distances = [5, 10, 15, 20, 30];
  const trials = distances.map((distance) => {
    const r = simSameDistance(distance);
    return {
      distance,
      pedestrian_decision: r.pedestrian.decision,
      static_decision: r.static.decision,
      decisions_differ: r.decisions_differ,
    };
  });
  const passRate = trials.filter((t) => t.decisions_differ).length / trials.length;
  const expected_order = ["pedestrian", "vehicle", "barrier"];
  const archTrials = [0.5, 1, 2].map((position_scale) => ({
    position_scale,
    actual_order: expected_order,
    matches_expected_order: true,
  }));
  return {
    generated_at: Date.now() / 1000,
    same_distance_experiment: { pass_rate: passRate, trials },
    archetype_ordering_experiment: { pass_rate: 1, expected_order, trials: archTrials },
    live_computational_benefit: { frames_measured: framesMeasured },
    note: "Simulated controlled experiment: same-distance decisions differ at every tested distance, and archetype utility ordering is stable across position scales.",
  };
}