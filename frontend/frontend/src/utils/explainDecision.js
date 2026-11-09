// Turns a region's raw utility numbers into a one-sentence, plain-English
// reason for its REFINE / MAINTAIN / COARSEN decision. Works for both the
// client-side simulation and the live backend, since both normalize regions
// to the same shape before they reach the UI (see utils/utilityCalculation.js
// and api/liveAdapter.js).

const FACTORS = [
  { key: "safetyRelevance", label: "safety relevance", highPhrase: "it matters a lot for collision safety" },
  { key: "motion", label: "motion", highPhrase: "it's moving quickly" },
  { key: "uncertainty", label: "uncertainty", highPhrase: "the system is unsure what's there" },
  { key: "geometricComplexity", label: "geometric complexity", highPhrase: "its shape is complex" },
  { key: "distanceValue", label: "distance value", highPhrase: "it's close enough to matter" },
  { key: "futureProbability", label: "predicted future occupancy", highPhrase: "it's predicted to stay occupied" },
];

// Tooltip copy for every metric shown in RegionInspector / UtilityEngine.
// Centralized here so both components stay consistent.
export const METRIC_HELP = {
  "Region": "The specific tracked object or grid cell this panel is inspecting.",
  "Semantic class": "What the perception stage classified this region as (vehicle, pedestrian, road, curb, etc.).",
  "Elevation": "Height of this region relative to the sensor, in meters. Kept because a flat 2D grid would lose it.",
  "Occupancy": "How much of this cell the perception stage believes is physically occupied.",
  "Confidence": "How sure the system is about its current read on this region. High confidence lowers the value of spending more budget here.",
  "Velocity": "How fast this object is moving, in meters/second. Faster objects need more frequent re-scanning to stay accurate.",
  "Distance": "Straight-line distance from the sensor, in meters.",
  "Expected information gain": "How much new, useful information the system expects to gain by refining this region further.",
  "Computational cost": "The budget cost of holding or refining this region at its resolution.",
  "Utility": "Expected information gain ÷ computational cost — the region's return on compute. Higher utility means refining it is worth the budget.",
  "Resolution": "The grid cell size currently allocated here. Smaller cells show finer detail but cost more budget.",
  "Current decision": "REFINE = spend more budget for finer detail. MAINTAIN = keep as-is. COARSEN = free up budget by reducing detail here.",
  "Safety relevance": "How much this object type matters for collision safety (pedestrians score highest, static background lowest).",
  "Motion": "Normalized speed — 0 for stationary, approaching 1 for fast-moving objects.",
  "Uncertainty": "How unsure the system is about this region. Higher uncertainty raises the value of re-measuring it.",
  "Geometric complexity": "How irregular this object's shape is. Complex shapes benefit more from fine resolution.",
  "Distance value": "How much resolution matters at this range — near regions are weighted higher since they affect decisions sooner.",
  "Future occupancy": "Predicted probability this region will still be occupied a couple of seconds from now.",
  "Confidence stability": "How many consecutive frames this exact cell has confirmed the same reading. Rises while the region is settled (lowering its utility and allowing coarsening); resets to 0 the moment its class changes or a noisy reading arrives.",
  "Prediction error": "How far this tracked object's actual position was from where its own last forecast expected it to be. A sudden spike means the object changed direction; it decays back down as tracking re-converges.",
};

export function explainDecision(region) {
  if (!region) return "";

  const ig = region.expectedInformationGain ?? 0;
  const cost = region.computationalCost ?? 0;
  const topFactor = FACTORS
    .map((f) => ({ ...f, value: region[f.key] ?? 0 }))
    .sort((a, b) => b.value - a.value)[0];

  const igStr = ig.toFixed(2);
  const costStr = cost.toFixed(2);
  // When the backend didn't send a candidate for this exact region this
  // frame, the gain shown is estimated client-side from the same factors
  // (see api/liveAdapter.js) rather than the backend's own measurement --
  // say so, instead of presenting a guess as measured fact.
  const igLabel = region.igEstimated ? `${igStr}, estimated` : igStr;

  switch (region.decision) {
    case "REFINE":
      return `Refining because ${topFactor.highPhrase} (${topFactor.label} ${topFactor.value.toFixed(2)}), so the expected information gain (${igLabel}) clearly outweighs the cost (${costStr}).`;
    case "MAINTAIN":
      return `Holding current resolution — expected information gain (${igLabel}) and cost (${costStr}) are roughly balanced, so no change is worth the extra budget right now.`;
    case "COARSEN":
    default:
      return `Coarsening to free up budget: confidence is high enough and expected information gain (${igLabel}) is low relative to cost (${costStr}), so finer detail here wouldn't be worth spending on.`;
  }
}