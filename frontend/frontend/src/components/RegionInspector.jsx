import { Crosshair } from "lucide-react";
import { resolutionLevelFor } from "../api/liveAdapter.js";
import { METRIC_HELP } from "../utils/explainDecision.js";

export default function RegionInspector({ region }) {
  // If the selected region id no longer exists in the current regions array
  // (e.g. it was removed, or a stale id carried over from a previous frame's
  // data), don't crash the whole page trying to read its fields -- show a
  // clear placeholder instead.
  if (!region) {
    return (
      <div className="panel">
        <div className="section-title">
          <Crosshair size={16} />
          Region Inspector
        </div>
        <p className="text-sm text-slate-500">No region selected. Click any cell, dot, or list item to inspect it.</p>
      </div>
    );
  }

  // Tolerates a bare number of meters as well as the RESOLUTION_LEVELS object;
  // previously a numeric resolution rendered the literal text "undefined undefined".
  const level = resolutionLevelFor(region.resolution);
  const rows = [
    ["Region", region.name],
    ["Semantic class", region.semanticClass],
    ["Elevation", `${region.elevation.toFixed(2)} m`],
    ["Occupancy", `${Math.round(region.occupancy * 100)}%`],
    ["Confidence", `${Math.round(region.confidence * 100)}%`],
    ["Velocity", `${region.speedMps.toFixed(1)} m/s`],
    // Live distance is a raw float (many decimal places); round for display.
    ["Distance", `${Number(region.distance).toFixed(1)} m`],
    ["Expected information gain", region.expectedInformationGain.toFixed(2)],
    ["Computational cost", region.computationalCost.toFixed(2)],
    ["Utility", region.utility.toFixed(2)],
    ["Resolution", `${level.size} ${level.label}`],
    ["Current decision", region.decision],
    // A1: only meaningful once this cell has actually settled on a
    // repeated reading -- 0 for a brand-new or just-changed cell.
    ["Confidence stability", `${region.stableObservations ?? 0} confirming frame${region.stableObservations === 1 ? "" : "s"}`],
    // A2: only tracked dynamic objects predict a future position, so this
    // is absent (and hidden below) for static grid cells.
    ...(Number.isFinite(region.predictionError)
      ? [["Prediction error", `${region.predictionError.toFixed(2)} m`]]
      : []),
  ];

  return (
    <div className="panel">
      <div className="section-title">
        <Crosshair size={16} />
        Region Inspector
      </div>
      <div className="space-y-2">
        {rows.map(([label, value]) => (
          <div className="flex items-center justify-between gap-4 border-b border-slate-700/30 pb-2 text-sm" key={label}>
            <span className="cursor-help text-slate-500" title={METRIC_HELP[label]}>{label}</span>
            <strong className="text-right text-slate-100">{value}</strong>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-slate-600">Hover any label for a plain-English explanation.</p>
    </div>
  );
}