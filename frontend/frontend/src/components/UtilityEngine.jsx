import { BrainCircuit } from "lucide-react";
import { explainDecision, METRIC_HELP } from "../utils/explainDecision.js";

const factors = [
  ["Safety relevance", "safetyRelevance"],
  ["Motion", "motion"],
  ["Uncertainty", "uncertainty"],
  ["Geometric complexity", "geometricComplexity"],
  ["Distance value", "distanceValue"],
  ["Future occupancy", "futureProbability"],
];

export default function UtilityEngine({ region }) {
  // Same guard as RegionInspector -- a missing/stale region must never crash
  // this panel, since LiveSystem.jsx renders both from the same selection.
  if (!region) {
    return (
      <div className="panel">
        <div className="section-title">
          <BrainCircuit size={16} />
          Information Utility Engine
        </div>
        <p className="text-sm text-slate-500">No region selected. Click any cell, dot, or list item to see its utility breakdown.</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="section-title">
        <BrainCircuit size={16} />
        Information Utility Engine
      </div>

      <div className="space-y-2">
        {factors.map(([label, key]) => (
          <div className="grid grid-cols-[1fr_110px_42px] items-center gap-2 text-xs" key={key}>
            <span className="cursor-help text-slate-400" title={METRIC_HELP[label]}>{label}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-slate-950">
              <span className="block h-full rounded-full bg-cyanSignal" style={{ width: `${region[key] * 100}%` }} />
            </span>
            <strong className="text-right text-slate-100">{region[key].toFixed(2)}</strong>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2">
        <Value label="Expected information gain" value={region.expectedInformationGain.toFixed(2)} />
        <span className="font-black text-slate-500">÷</span>
        <Value label="Computational cost" value={region.computationalCost.toFixed(2)} />
        <span className="font-black text-slate-500">=</span>
        <Value label="Utility" value={region.utility.toFixed(2)} />
      </div>

      <div className={`mt-4 rounded-md border px-3 py-3 text-center text-lg font-black tracking-[0.2em] ${
        region.decision === "REFINE"
          ? "border-cyanSignal/50 bg-cyanSignal/10 text-cyan-100"
          : region.decision === "MAINTAIN"
            ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
            : "border-slate-500/30 bg-slate-500/10 text-slate-200"
      }`}>
        {region.decision}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-slate-400">
        {explainDecision(region)}
      </p>
    </div>
  );
}

function Value({ label, value }) {
  return (
    <div className="rounded-md border border-line bg-slate-950/70 p-2" title={METRIC_HELP[label]}>
      <p className="metric-label cursor-help">{label}</p>
      <b className="text-2xl font-black text-white">{value}</b>
    </div>
  );
}