// Reshapes a real backend /api/frame response into exactly the region shape
// that utils/utilityCalculation.js's calculateFrame() already produces, so
// every existing component (AdaptiveMap, BudgetPanel, RegionInspector,
// UtilityEngine, LiveLidarScene) works unmodified whether the data came from
// the client-side simulation or the real backend.
//
// Deliberately reuses the backend's OWN computed numbers (ig, cost, utility
// from result.candidates) instead of recomputing fake approximations
// client-side -- this is the whole point of wiring it up for real.

import { RESOLUTION_LEVELS } from "../data/simulationData.js";
import { clamp as clampToRange } from "../utils/utilityCalculation.js";

const SAFETY_RELEVANCE = {
  pedestrian: 1.0, vehicle: 0.9, curb: 0.75,
  obstacle: 0.85, road: 0.25, building: 0.35,
  terrain: 0.2, unknown: 0.45,
};

// The backend reports a cell's resolution as a bare number of meters
// (0.50 / 0.20 / 0.05), but every UI component was written against the
// RESOLUTION_LEVELS *object* from the simulation and reads .gridStep,
// .radius, .label and .size off it. Handing them a number made
// `centerY - region.resolution.radius` evaluate to NaN, `NaN < NaN` is
// false, and so the adaptive-grid loops in AdaptiveMap never ran a single
// iteration -- the flagship visualization was silently blank in Live mode
// with no error in the console. RegionInspector printed the literal string
// "undefined undefined" for the same reason.
//
// gridStep/radius are canvas-space drawing parameters (how densely to
// stipple a region and how far out to draw), NOT literal cell geometry --
// they're the simulation's visual vocabulary for "coarse/medium/fine", and
// reusing them keeps the two modes visually comparable. `size` and `metres`
// below carry the backend's real value so nothing on screen lies about it.
const RESOLUTION_TIERS = [
  { maxMetres: 0.1, level: RESOLUTION_LEVELS.REFINE },   // 0.05 m -> FINE
  { maxMetres: 0.35, level: RESOLUTION_LEVELS.MAINTAIN }, // 0.20 m -> MEDIUM
];

// Horizons (seconds ahead) the Prediction page renders as rings. Shared here so
// the adapter samples the backend's prediction at exactly the points the UI draws.
export const PREDICTION_HORIZONS = [0, 1, 2, 3];

export function resolutionLevelFor(metres) {
  // Already an object (simulated mode, or a caller that pre-mapped it) -> pass through.
  if (metres && typeof metres === "object") return metres;
  const value = Number.isFinite(metres) ? metres : 0.5;
  const tier = RESOLUTION_TIERS.find((t) => value <= t.maxMetres);
  const level = tier ? tier.level : RESOLUTION_LEVELS.COARSEN;
  return {
    ...level,
    // Show the backend's actual resolution rather than the simulation's
    // hardcoded label, so an unexpected level can't be silently rounded away.
    size: `${Math.round(value * 100)} cm`,
    metres: value,
  };
}

// The backend's predictor is exactly constant-velocity
// (prediction/future_occupancy.py: x = x0 + vx*horizon, sigma =
// prediction_sigma + uncertainty*horizon). It only reports the endpoint, so
// re-walking that same straight line for the horizons the UI wants is an
// exact reconstruction, not an invented interpolation.
function buildFutureTrack(future, mapDimensions, predictionSigma, horizonsSec) {
  if (!future || !Number.isFinite(future.horizon) || future.horizon <= 0) return null;
  const h = future.horizon;
  const vx = (future.x - future.x0) / h;
  const vy = (future.y - future.y0) / h;
  // sigma(h) = sigma0 + growth*h, and we know sigma at h -> recover growth.
  const sigma0 = Math.min(predictionSigma, future.sigma);
  const growth = Math.max(0, (future.sigma - sigma0) / h);

  return horizonsSec.map((sec) => {
    const mx = future.x0 + vx * sec;
    const my = future.y0 + vy * sec;
    const sigma = sigma0 + growth * sec;
    return {
      sec,
      position: metersToCanvas(mx, my, mapDimensions),
      positionMeters: { x: mx, y: my },
      sigma,
      // How tightly the predictor still localizes the object, relative to
      // its own present-frame uncertainty. 1.0 now, decaying as the
      // Gaussian spreads. This is the predictor's real uncertainty model,
      // not a cosmetic decay curve.
      confidence: sigma > 0 ? sigma0 / sigma : 1,
      // config.prediction_horizon (default 2.0 s) is how far ahead the backend
      // itself predicts. Samples past that are the same constant-velocity model
      // extended further, so flag them and let the UI say so rather than
      // presenting them as backend output.
      extrapolatedBeyondBackend: sec > h + 1e-9,
    };
  });
}

// Backend works in real meters relative to the sensor; the existing UI was
// built around a normalized 0-100 canvas space. Map one onto the other.
function metersToCanvas(x, y, mapDimensions) {
  const [w, h] = mapDimensions;
  const px = 50 + (x / (w / 2)) * 43;
  const py = 50 + (y / (h / 2)) * 43;
  return {
    x: Math.max(7, Math.min(93, px)),
    y: Math.max(7, Math.min(93, py)),
  };
}

// The backend's region_id is a real quadtree path -- it grows a new
// "/parent-child" segment every time a cell refines or coarsens, so after a
// few subdivisions it becomes a long unreadable string like
// "r-78-24/1-0/0-0/0-0/0-0/0-0/0-0/0-0". It isn't random or broken, just not
// meant for display. Keep the base cell address (which stays stable and
// meaningful) and summarize the subdivision depth instead of printing the
// whole path.
function shortRegionId(regionId) {
  if (typeof regionId !== "string") return regionId;
  const segments = regionId.split("/");
  const base = segments[0];
  const depth = segments.length - 1;
  return depth > 0 ? `${base}\u00B7L${depth}` : base;
}

function inferKind(region) {
  if (region.semantic_class === "vehicle" || region.semantic_class === "pedestrian") return "dynamic";
  if (region.semantic_class === "road" && region.occupancy < 0.15) return "low";
  if (region.confidence < 0.55) return "uncertain";
  return "static";
}

function prettyName(region, index, track) {
  if (track) return `${track.class.charAt(0).toUpperCase() + track.class.slice(1)} #${track.track_id}`;
  const label = region.semantic_class.charAt(0).toUpperCase() + region.semantic_class.slice(1);
  return `${label} #${shortRegionId(region.region_id) ?? index}`;
}

/**
 * @param {object} frameResult - raw response from POST /api/frame or GET /api/state
 * @param {object} config - live config from GET /api/config (falls back to Config defaults); needs map_dimensions
 * @param {number} maxRegions - how many regions to surface in the UI (keeps cards/lists readable)
 */
export function adaptBackendFrame(frameResult, config, maxRegions = 8) {
  if (!frameResult || !frameResult.regions) return { regions: [], metrics: null };

  const mapDimensions = config?.map_dimensions ?? [40, 30];
  const budget = config?.computational_budget ?? frameResult.metrics?.budget ?? 5000;
  const predictionSigma = config?.prediction_sigma ?? 0.8;
  // Total standing budget spend this frame; every region's share is measured
  // against this so the numbers are comparable and sum meaningfully.
  const usedBudget = Math.max(frameResult.metrics?.used_budget ?? 0, 1e-6);

  // Best utility candidate per region_id (candidates already sorted desc by utility).
  const bestCandidateByRegion = new Map();
  for (const c of frameResult.candidates || []) {
    if (!bestCandidateByRegion.has(c.region_id)) bestCandidateByRegion.set(c.region_id, c);
  }
  // A4: the backend's OWN final word on each region -- includes the applied
  // decision (post-budget-check REFINE/COARSEN/MAINTAIN, not just "utility
  // cleared the threshold"), plus the exact ig/cost/utility it used. Prefer
  // this over bestCandidateByRegion below wherever it's present, since a
  // candidate can clear refine_threshold and still not get applied if the
  // budget ran out -- explanations reflects what actually happened.
  const explanationByRegion = frameResult.explanations || {};

  const allRegions = frameResult.regions;
  const nearestRegion = (x, y) => {
    let best = null, bestDist = Infinity;
    for (const r of allRegions) {
      const d = Math.hypot(r.x - x, r.y - y);
      if (d < bestDist) { bestDist = d; best = r; }
    }
    return best;
  };

  // Build dynamic entries FROM the tracker's own list, not from grid cells.
  // A refined grid cell's position is the geometric center of that tile
  // (recomputed from its parent on every refine/coarsen), NOT the object's
  // real continuous position -- so matching "cell tagged vehicle" -> "nearby
  // track" frequently fails once a cell has been subdivided a few times.
  // Going the other way (track -> nearest cell, just for supplementary
  // fields like cost/occupancy) keeps the object's real position accurate
  // AND keeps its id permanently stable across frames via track_id.
  const dynamicFromTracks = (frameResult.objects || []).map((track) => {
    const region = nearestRegion(track.x, track.y);
    return { track, region: region ?? null };
  });

  const usedRegionIds = new Set(dynamicFromTracks.map((d) => d.region?.region_id).filter(Boolean));
  const rest = allRegions
    .filter(r => r.semantic_class !== "vehicle" && r.semantic_class !== "pedestrian" && !usedRegionIds.has(r.region_id))
    .sort((a, b) => (bestCandidateByRegion.get(b.region_id)?.utility ?? 0) - (bestCandidateByRegion.get(a.region_id)?.utility ?? 0));

  const dynamicSlots = Math.min(dynamicFromTracks.length, maxRegions);
  const selectedDynamic = dynamicFromTracks.slice(0, dynamicSlots);
  const selectedStatic = rest.slice(0, maxRegions - dynamicSlots);

  const buildEntry = ({ track, region }, index) => {
    // A dynamic entry always has a track; region is the nearest grid cell
    // used only to borrow supplementary fields (cost, occupancy, resolution).
    // A static entry has no track, just a region straight from the grid.
    const semanticClass = track ? track.class : region.semantic_class;
    const x = track ? track.x : region.x;
    const y = track ? track.y : region.y;
    const vx = track?.vx ?? 0;
    const vy = track?.vy ?? 0;
    const candidate = region ? bestCandidateByRegion.get(region.region_id) : null;
    const explanation = region ? explanationByRegion[region.region_id] : null;
    const position = metersToCanvas(x, y, mapDimensions);
    const kind = track ? "dynamic" : inferKind(region);

    // Factors used both for display and for the fallback utility formula
    // below -- computed once here so the two stay in sync.
    const safetyRelevance = SAFETY_RELEVANCE[semanticClass] ?? region?.semantic_importance ?? 0.45;
    const motion = track ? Math.min(1, Math.hypot(vx, vy) / 3) : (region?.motion ?? 0);
    const uncertainty = region?.uncertainty ?? track?.uncertainty ?? 0.3;
    const geometricComplexity = region?.geometry ?? 0.5;
    const distanceValue = region?.distance_relevance ?? 1 / (1 + Math.hypot(x, y) / 10);
    const futureProbability = region?.future_probability ?? 0;
    const cost = explanation?.refinement_cost ?? candidate?.cost ?? Math.max(region?.active_cost ?? 0.05, 0.001);

    // The backend only returns a `candidates` entry for a region_id when it
    // actually evaluated that cell for a resolution change this frame -- most
    // active cells (especially ones a moving track just landed near) simply
    // never got a candidate, so `candidate` is undefined far more often than
    // not. Falling back to 0 there is what made Expected Information Gain and
    // Utility show 0.00 for a real, confidently-tracked vehicle. When there's
    // no backend candidate, estimate ig with the same weighted formula the
    // simulated mode already uses (utilityCalculation.js), built from fields
    // the backend DID give us -- a real (if approximate) number instead of a
    // false zero.
    const estimatedIg = clampToRange(
      safetyRelevance * 0.27 +
        motion * 0.18 +
        uncertainty * 0.2 +
        geometricComplexity * 0.15 +
        distanceValue * 0.08 +
        futureProbability * 0.12,
      0.04,
      0.98,
    );
    const ig = explanation?.expected_information_gain ?? candidate?.ig ?? estimatedIg;
    const usedFallbackIg = explanation == null && candidate?.ig == null;
    const utility = explanation?.utility ?? candidate?.utility ?? ig / cost;

    const refineThreshold = config?.refine_threshold ?? 0.55;
    const coarsenThreshold = config?.coarsen_threshold ?? 0.25;
    // Prefer the backend's own applied decision (accounts for the real
    // budget check, not just the utility threshold) when available.
    const decision = explanation?.decision
      ?? (utility >= refineThreshold ? "REFINE" : utility <= coarsenThreshold ? "COARSEN" : "MAINTAIN");

    let futurePosition = position;
    const future = (frameResult.future || []).find(f => f.track_id === track?.track_id);
    if (future) futurePosition = metersToCanvas(future.x, future.y, mapDimensions);
    const futureTrack = buildFutureTrack(future, mapDimensions, predictionSigma, PREDICTION_HORIZONS);

    return {
      // A grid cell's own region_id changes when the quadtree refines or
      // coarsens it (a child cell gets a brand-new id). track_id is
      // genuinely stable across frames for the same real object, so using
      // it here keeps React's reconciliation stable -- the UI can smoothly
      // move an existing element instead of destroying/recreating a "new"
      // one at a different position every poll.
      id: track ? `track-${track.track_id}` : (region.region_id ?? `region-${index}`),
      name: prettyName(region, index, track),
      semanticClass: kind === "dynamic" ? `Dynamic ${semanticClass}` : semanticClass,
      // Unprefixed, unmodified class straight from the backend. Components
      // that need to branch on *what the thing is* (e.g. drawing a vehicle
      // body vs a pedestrian) must use this, not `id` -- live ids are
      // `track-<n>`, so `id === "vehicle"` is never true in Live mode and
      // every real car was being drawn and labelled as a pedestrian.
      objectClass: semanticClass,
      kind,
      position: { x, y }, // raw meters, kept for reference
      velocity: { x: vx, y: vy },
      directionDeg: track ? (track.direction * 180) / Math.PI : 0,
      elevation: region?.elevation ?? 0,
      occupancy: region?.occupancy ?? 0.5,
      confidence: region?.confidence ?? track?.confidence ?? 0.7,
      safetyRelevance,
      motion,
      uncertainty,
      geometricComplexity,
      distance: Math.hypot(x, y),
      distanceValue,
      baseCost: region?.active_cost ?? cost,

      // Fields the existing components read directly. When the backend sent
      // a real candidate for this region_id, these are its authoritative
      // numbers; otherwise they're the estimate computed above from real
      // per-region factors -- never a bare 0.00.
      expectedInformationGain: ig,
      computationalCost: cost,
      utility,
      decision,
      // Lets the UI (RegionInspector/UtilityEngine) say "estimated" instead
      // of silently presenting an estimate as backend-measured.
      igEstimated: usedFallbackIg,
      // A1: how many consecutive confirming observations this exact cell
      // has accumulated -- rising while it's settled, reset to 0 by a class
      // change or a noisy reading. See mapping/map_manager.py.
      stableObservations: region?.stable_observations ?? 0,
      // A2: this track's own last measured prediction error (meters) --
      // undefined for static/non-tracked entries, since only tracks predict.
      predictionError: track?.prediction_error,
      // Object-shaped, matching RESOLUTION_LEVELS -- see resolutionLevelFor().
      resolution: resolutionLevelFor(region?.resolution),
      // The raw backend value, for anything that wants to do real math on it.
      resolutionMetres: region?.resolution ?? null,
      futureProbability,
      currentPosition: position,
      futurePosition,
      futureTrack,
      speedMps: Math.hypot(vx, vy),
      // This region's genuine share of the budget the map is currently
      // holding. active_cost is the standing cost of keeping the cell at its
      // present resolution (map_manager.cell_base_cost = 0.01/res^2: 0.04
      // coarse, 0.25 medium, 4.00 fine) and metrics.used_budget is the sum of
      // exactly that quantity over every active cell -- same model, same
      // units, so the ratio is meaningful and the displayed values are
      // commensurate with the budget. The previous version divided a
      // *marginal transition* cost by a *total standing* cost, which mixed
      // two different cost models.
      cellsAllocated: Math.round(((region?.active_cost ?? cost) / usedBudget) * budget),
    };
  };

  const regions = [
    ...selectedDynamic.map((entry, index) => buildEntry(entry, index)),
    ...selectedStatic.map((region, index) => buildEntry({ track: null, region }, index)),
  ];

  return { regions, metrics: frameResult.metrics };
}