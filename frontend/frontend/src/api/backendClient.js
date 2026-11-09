// Thin fetch wrapper around the FastAPI backend (LiDAR-BE-main).
// Change BASE_URL if the backend runs somewhere other than localhost:8000.

export const BASE_URL = "http://localhost:8000";

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${options.method || "GET"} ${path} failed: ${res.status} ${body}`);
  }
  return res.json();
}

// Advances the dataset by one frame and returns the full processed result:
// { frame_id, points_processed, objects, future, regions, candidates, decisions, metrics }
export function advanceFrame() {
  return request("/api/frame", { method: "POST" });
}

// Returns the last processed frame result without advancing.
export function getState() {
  return request("/api/state");
}

export function getMetrics() {
  return request("/api/metrics");
}

export function getDatasetStatus() {
  return request("/api/dataset");
}

export function setDatasetPath(path) {
  return request("/api/dataset/path", { method: "POST", body: JSON.stringify({ path }) });
}

export function resetBackend() {
  return request("/api/reset", { method: "POST" });
}

export function updateConfig(partial) {
  return request("/api/config", { method: "POST", body: JSON.stringify(partial) });
}

// Reads the config the backend is actually running with, so the UI doesn't have
// to keep its own hardcoded copy of the budget / map size / resolution ladder.
export function getConfig() {
  return request("/api/config");
}

// A3: same-frame proposed/uniform/distance-based comparison, computed from
// whatever frame the backend last processed. Needs at least one /api/frame
// call to have happened already.
export function getBaseline() {
  return request("/api/baseline");
}

// D1: on-demand proof that distance alone doesn't drive the resolution
// decision -- places a pedestrian and a static region at the same distance
// and reports both. Self-contained; doesn't need a live frame first.
export function getSameDistanceDemo(distance = 15.0) {
  return request(`/api/demo/same_distance?distance=${encodeURIComponent(distance)}`);
}

// D2: proposed/uniform/distance-based comparison accumulated across every
// frame processed since the last reset (running averages), not just the
// last frame like /api/baseline. Updates automatically as /api/frame runs.
export function getComputationalBenefit() {
  return request("/api/demo/computational_benefit");
}

// Starts a fresh D2 accumulation window -- call before a controlled run so
// the numbers reflect only that run.
export function resetComputationalBenefit() {
  return request("/api/demo/computational_benefit/reset", { method: "POST" });
}

// D3 (lead-time-to-arrival) + D4 (prediction failure/recovery) measured
// events, both accumulated automatically as /api/frame runs.
export function getPredictionTiming() {
  return request("/api/demo/prediction_timing");
}

// D5: real active-cell accounting vs. a hypothetical dense 3D voxel grid
// at the same (x, y) resolution, computed from the map's current regions.
export function getWhy25D() {
  return request("/api/demo/why_2_5d");
}

// D6: "Follow the Information" -- real cross-frame ledger of which
// COARSEN's freed budget funded which later REFINE. Updates automatically
// as /api/frame runs; this just reads the running ledger.
export function getResourceFlow() {
  return request("/api/demo/resource_flow");
}

// D7: five archetypal regions (empty road, building, road edge/obstacle,
// moving vehicle, pedestrian) run through the real allocation pipeline.
export function getRegionDecisions(positionScale = 1.0) {
  return request(`/api/demo/region_decisions?position_scale=${encodeURIComponent(positionScale)}`);
}

// D8: consolidated, multi-trial judge-ready report -- repeats D1 and D7's
// probes at several different inputs each and folds in this session's own
// live D2 numbers.
export function getControlledExperiment() {
  return request("/api/demo/controlled_experiment");
}