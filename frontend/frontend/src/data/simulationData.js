export const TOTAL_BUDGET = 100000;

export const RESOLUTION_LEVELS = {
  COARSEN: { label: "COARSE", size: "50 cm", gridStep: 20, radius: 9 },
  MAINTAIN: { label: "MEDIUM", size: "20 cm", gridStep: 8, radius: 12 },
  REFINE: { label: "FINE", size: "5 cm", gridStep: 3.2, radius: 14 },
};

export const NAV_ITEMS = [
  { id: "live", label: "Live System" },
  { id: "prediction", label: "Prediction" },
  { id: "budget", label: "Budget Analytics" },
  { id: "comparison", label: "Comparison" },
];

// The road in both LiveLidarScene.jsx and AdaptiveMap.jsx is a trapezoid:
// half-width(y) = 4 + 0.2*y, centered on x=50 (matches "M26,100 L46,0 L54,0
// L74,100" / "M40,2 L60,2 L74,100 L26,100" in those files). Any object meant
// to travel along the road, rather than drift across it, needs
// velocity.x = ratio * 0.2 * velocity.y so it holds a constant lane offset
// as the lane narrows toward the horizon (y -> 0).
export const BASE_REGIONS = [
  {
    id: "pedestrian",
    name: "Pedestrian Corridor",
    semanticClass: "Dynamic human",
    kind: "dynamic",
    // Moved off the road edge onto the sidewalk (x_left(60) = 46 - 0.2*60 =
    // 34, so x=28 gives a 6-unit buffer) and given vx = -0.2 * vy so it
    // tracks parallel to that edge as it walks forward, instead of the old
    // vx that was ~7x too fast and walked it straight into the lane.
    position: { x: 28, y: 60 },
    velocity: { x: 0.0032, y: -0.016 },
    directionDeg: -79,
    elevation: 1.72,
    occupancy: 0.82,
    confidence: 0.78,
    safetyRelevance: 0.96,
    motion: 0.88,
    uncertainty: 0.42,
    geometricComplexity: 0.38,
    distance: 18,
    baseCost: 0.32,
  },
  {
    id: "vehicle",
    name: "Moving Vehicle",
    semanticClass: "Dynamic vehicle",
    kind: "dynamic",
    // Was heading toward the ego (vy > 0) and drifting off-road (vx too
    // large for the narrowing lane, and the old x=63 was already outside
    // the lane's right edge at y=34). Now starts in-lane at a fixed 0.5
    // lane-offset ratio and drives ahead (vy < 0); at y=46 that ratio puts
    // it at x=56.6, ~5 units from the Road Barrier at (52,46) -- passing
    // near it instead of colliding with the ego.
    position: { x: 59, y: 70 },
    velocity: { x: -0.009, y: -0.09 },
    directionDeg: 264,
    elevation: 1.45,
    occupancy: 0.91,
    confidence: 0.86,
    safetyRelevance: 0.91,
    motion: 0.82,
    uncertainty: 0.3,
    geometricComplexity: 0.46,
    distance: 20,
    baseCost: 0.38,
  },
  {
    id: "barrier",
    name: "Road Barrier",
    semanticClass: "Static road obstacle",
    kind: "static",
    position: { x: 52, y: 46 },
    velocity: { x: 0, y: 0 },
    directionDeg: 0,
    elevation: 0.85,
    occupancy: 0.9,
    confidence: 0.8,
    safetyRelevance: 0.87,
    motion: 0,
    uncertainty: 0.58,
    geometricComplexity: 0.64,
    distance: 24,
    baseCost: 0.3,
  },
  {
    id: "edge",
    name: "Road Edge / Curb",
    semanticClass: "Drivable boundary",
    kind: "static",
    position: { x: 22, y: 43 },
    velocity: { x: 0, y: 0 },
    directionDeg: 0,
    elevation: 0.22,
    occupancy: 0.34,
    confidence: 0.83,
    safetyRelevance: 0.72,
    motion: 0,
    uncertainty: 0.28,
    geometricComplexity: 0.73,
    distance: 20,
    baseCost: 0.22,
  },
  {
    id: "building",
    name: "Building Facade",
    semanticClass: "Static structure",
    kind: "static",
    position: { x: 78, y: 58 },
    velocity: { x: 0, y: 0 },
    directionDeg: 0,
    elevation: 3.7,
    occupancy: 0.96,
    confidence: 0.93,
    safetyRelevance: 0.34,
    motion: 0,
    uncertainty: 0.11,
    geometricComplexity: 0.36,
    distance: 43,
    baseCost: 0.2,
  },
  {
    id: "road",
    name: "Empty Road",
    semanticClass: "Drivable free space",
    kind: "low",
    position: { x: 48, y: 48 },
    velocity: { x: 0, y: 0 },
    directionDeg: 0,
    elevation: 0.08,
    occupancy: 0.08,
    confidence: 0.96,
    safetyRelevance: 0.18,
    motion: 0,
    uncertainty: 0.08,
    geometricComplexity: 0.14,
    distance: 16,
    baseCost: 0.12,
  },
];

export const DEMO_STEPS = [
  "PERCEIVE — classify terrain, static infrastructure and dynamic objects.",
  "DETECT — a road obstacle enters the vehicle sensor view.",
  "TRACK — the obstacle is associated across frames and its motion is evaluated.",
  "PREDICT — future occupancy is projected along the driving corridor.",
  "PRIORITIZE — safety relevance and predicted interaction increase information value.",
  "UTILITY — expected information gain is compared with computational cost.",
  "REFINE — the critical obstacle and future corridor receive fine 5 cm cells.",
  "REALLOCATE — low-value cells are coarsened and their budget is reclaimed.",
  "SAFE CORRIDOR — the blocked path is replaced with a predicted free corridor.",
];