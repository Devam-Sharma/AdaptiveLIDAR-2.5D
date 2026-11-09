import { BASE_REGIONS, RESOLUTION_LEVELS, TOTAL_BUDGET } from "../data/simulationData.js";

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function wave(time, seed, amplitude = 1, frequency = 1) {
  return Math.sin(time * frequency + seed) * amplitude;
}

export function getRegionPosition(region, time, futureSeconds = 0, demoBoost = 0) {
  const motionScale = 16 + demoBoost * 6;
  const x =
    region.position.x +
    wave(time, region.position.x, region.kind === "dynamic" ? 4.6 : 0.8, 0.55) +
    region.velocity.x * (time + futureSeconds) * motionScale;
  const y =
    region.position.y +
    wave(time, region.position.y, region.kind === "dynamic" ? 3.7 : 0.7, 0.5) +
    region.velocity.y * (time + futureSeconds) * motionScale;

  return {
    x: clamp(x, 7, 93),
    y: clamp(y, 9, 91),
  };
}

export function getFutureOccupancyProbability(region, time, horizonSeconds, predictionEnabled) {
  if (!predictionEnabled || region.kind !== "dynamic") return 0;
  const nearTermConfidence = 0.74 - horizonSeconds * 0.16;
  const uncertaintySpread = Math.abs(wave(time, region.position.y + horizonSeconds, 0.05, 0.8));
  return clamp(nearTermConfidence + uncertaintySpread, 0.05, 0.82);
}

export function calculateRegionUtility(region, time, options = {}) {
  const predictionEnabled = options.predictionEnabled ?? true;
  const demoIntensity = options.demoIntensity ?? 0;
  const futureProbability = getFutureOccupancyProbability(region, time, 1.5, predictionEnabled);
  const distanceValue = clamp(1 - region.distance / 70, 0.08, 1);
  const dynamicBoost = region.kind === "dynamic" ? 0.08 + Math.abs(wave(time, region.position.x, 0.05, 0.8)) : 0;
  const pedestrianDemoBoost = region.id === "pedestrian" ? demoIntensity * 0.16 : 0;

  const expectedInformationGain = clamp(
    region.safetyRelevance * 0.27 +
      region.motion * 0.18 +
      region.uncertainty * 0.2 +
      region.geometricComplexity * 0.15 +
      distanceValue * 0.08 +
      futureProbability * 0.12 +
      dynamicBoost +
      pedestrianDemoBoost,
    0.04,
    0.98,
  );

  const computationalCost = clamp(
    region.baseCost + expectedInformationGain * 0.11 + (region.kind === "dynamic" ? 0.08 : 0),
    0.1,
    0.82,
  );

  const utility = expectedInformationGain / computationalCost;
  const decision = utility > 1.8 ? "REFINE" : utility > 1.08 ? "MAINTAIN" : "COARSEN";
  const resolution = RESOLUTION_LEVELS[decision];

  return {
    ...region,
    distanceValue,
    expectedInformationGain,
    computationalCost,
    utility,
    decision,
    resolution,
    futureProbability,
    currentPosition: getRegionPosition(region, time, 0, demoIntensity),
    futurePosition: getRegionPosition(region, time, 2.5, demoIntensity),
    speedMps: Math.hypot(region.velocity.x, region.velocity.y) * 52,
  };
}

export function calculateFrame(time, options = {}) {
  const enriched = BASE_REGIONS.map((region) => calculateRegionUtility(region, time, options));
  const weighted = enriched.map((region) => ({
    ...region,
    budgetWeight: Math.pow(region.utility, 1.7) * (region.kind === "low" ? 0.35 : 1),
  }));

  // Baseline: every region needs SOME representation just to exist on the
  // map at all, even at 50 cm coarse resolution. This part is always paid.
  const minimumCells = 4600;

  // The pool ABOVE baseline, for medium/fine resolution. This used to be
  // force-distributed in full every single frame via a trailing "correction"
  // term that padded the last region so the sum always landed on exactly
  // TOTAL_BUDGET -- so utilization read 100% on a completely empty, all-
  // COARSEN "clear road" frame just as much as on a frame with five regions
  // refining. That made the utilization number meaningless as a signal of
  // whether the system was actually saving compute.
  //
  // Now only regions whose OWN decision calls for MEDIUM or FINE resolution
  // (MAINTAIN / REFINE) draw from this pool at all; a COARSEN region takes
  // nothing beyond its baseline. A quiet scene (mostly/all COARSEN) now
  // genuinely reports lower total usage than a busy one -- utilization moves
  // with real scene demand instead of always pinning at 100%.
  const distributableBudget = TOTAL_BUDGET - minimumCells * weighted.length;
  const totalWeight = weighted.reduce((sum, region) => sum + region.budgetWeight, 0);

  const allocated = weighted.map((region) => {
    if (region.decision === "COARSEN") {
      return { ...region, cellsAllocated: minimumCells };
    }
    const earned = totalWeight > 0 ? Math.round((distributableBudget * region.budgetWeight) / totalWeight) : 0;
    return { ...region, cellsAllocated: minimumCells + Math.max(0, earned) };
  });

  return allocated;
}

export function buildBudgetHistory(time, options = {}) {
  return Array.from({ length: 16 }, (_, index) => {
    const t = time - (15 - index) * 0.6;
    const frame = calculateFrame(t, options);
    // Look up by id defensively: BASE_REGIONS' "terrain" region was renamed to
    // "building" (Building Facade), but this still queried the old id, so
    // .find() returned undefined and the immediate ".cellsAllocated" threw on
    // every render of Budget Analytics -- crashing that page to a blank
    // screen while every other page (which never calls this function) kept
    // working fine. Falling back to 0 on a missing id means a future rename
    // degrades the chart instead of blanking the whole page.
    const cellsFor = (id) => frame.find((r) => r.id === id)?.cellsAllocated ?? 0;
    return {
      label: `${index - 15}s`,
      Pedestrian: cellsFor("pedestrian"),
      Vehicle: cellsFor("vehicle"),
      Terrain: cellsFor("building"),
      RoadEdge: cellsFor("edge"),
    };
  });
}