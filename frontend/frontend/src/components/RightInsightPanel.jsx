import { BatteryCharging, BrainCircuit, Crosshair } from "lucide-react";

const DECISION_BAR = {
  REFINE: "bg-cyanSignal glow-cyan-bar",
  MAINTAIN: "bg-emerald-400 glow-emerald-bar",
  COARSEN: "bg-slate-500",
};
const DECISION_TEXT = {
  REFINE: "text-cyanSignal",
  MAINTAIN: "text-emerald-400",
  COARSEN: "text-slate-400",
};
const DECISION_BADGE = {
  REFINE: "border-cyanSignal/50 bg-cyanSignal/10 text-cyanSignal glow-cyan",
  MAINTAIN: "border-emerald-400/50 bg-emerald-400/10 text-emerald-300",
  COARSEN: "border-slate-600 bg-slate-800/60 text-slate-400",
};

function ComputeBudgetGauge({ budgetTotal, budgetUsed }) {
  const percent = Math.min(100, Math.round(((budgetUsed ?? 0) / Math.max(budgetTotal ?? 1, 1e-6)) * 100));
  const circumference = 2 * Math.PI * 40;
  const offset = circumference * (1 - percent / 100);

  return (
    <div className="glass-panel">
      <h2 className="section-title mb-3">
        <BatteryCharging size={15} />
        Compute Budget
      </h2>
      <div className="flex items-center justify-between">
        <div className="relative flex h-32 w-32 items-center justify-center">
          <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 100 100">
            <circle cx="50" cy="50" fill="transparent" r="40" stroke="#16263b" strokeWidth="9" />
            <circle
              className="glow-cyan"
              cx="50" cy="50" fill="transparent" r="40"
              stroke="#22d3ee"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              strokeWidth="9"
              style={{ transition: "stroke-dashoffset 0.4s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center font-mono">
            <span className="text-2xl font-bold leading-none tracking-tight text-white">{percent}%</span>
            <span className="mt-1 text-[9px] font-semibold uppercase tracking-widest text-slate-400">Used</span>
          </div>
        </div>
        <div className="space-y-2 font-mono text-xs">
          <div className="flex items-center gap-2">
            <span className="glow-cyan h-2.5 w-2.5 rounded-full bg-cyanSignal" />
            <span className="text-slate-300">Used <b className="text-white">{Math.round(budgetUsed ?? 0).toLocaleString()}</b></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
            <span className="text-slate-400">Total <b className="text-slate-200">{Math.round(budgetTotal ?? 0).toLocaleString()}</b></span>
          </div>
        </div>
      </div>
    </div>
  );
}

function UtilityRanking({ onSelectRegion, regions, selectedRegionId }) {
  const ranked = [...regions].sort((a, b) => b.utility - a.utility).slice(0, 5);
  const maxUtility = Math.max(...ranked.map((r) => r.utility), 0.01);

  return (
    <div className="glass-panel flex-1">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="section-title mb-0">
          <BrainCircuit size={15} />
          Utility Engine
        </h2>
        <span className="font-mono text-[10px] text-slate-400">RANKED</span>
      </div>
      <div className="space-y-3 font-mono text-xs">
        {ranked.map((region, index) => (
          <button
            className={`block w-full text-left transition-opacity ${selectedRegionId === region.id ? "" : "opacity-90 hover:opacity-100"}`}
            key={region.id}
            onClick={() => onSelectRegion(region.id)}
            type="button"
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="truncate text-slate-200"><span className="mr-1.5 text-slate-500">{index + 1}</span>{region.name}</span>
              <span className={`font-bold ${DECISION_TEXT[region.decision] ?? "text-slate-300"}`}>{region.utility.toFixed(2)}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full border border-slate-800 bg-slate-900 p-0.5">
              <div
                className={`h-full rounded-full ${DECISION_BAR[region.decision] ?? "bg-slate-500"}`}
                style={{ width: `${Math.round((region.utility / maxUtility) * 100)}%` }}
              />
            </div>
          </button>
        ))}
      </div>
      <div className="pt-3 text-right font-mono text-[10px] text-slate-500">U = IG {"\u00f7"} Cost</div>
    </div>
  );
}

function SelectedRegionInspector({ region }) {
  if (!region) {
    return (
      <div className="glass-panel">
        <h2 className="section-title mb-2">Selected Region</h2>
        <p className="text-sm text-slate-500">Click a region on the sensor view to inspect it.</p>
      </div>
    );
  }

  const rows = [
    ["Semantic class", region.semanticClass],
    ["Information gain", region.expectedInformationGain?.toFixed(2)],
    ["Confidence", `${Math.round((region.confidence ?? 0) * 100)}%`],
    ["Uncertainty", (region.uncertainty ?? 0).toFixed(2)],
    ["Distance", `${Number(region.distance ?? 0).toFixed(1)} m`],
  ];

  return (
    <div className="glass-panel">
      <h2 className="section-title mb-2">Selected Region</h2>
      <div className="mb-3 flex items-center justify-between border-b border-line pb-3">
        <span className="text-base font-bold tracking-tight text-white">{region.name}</span>
        <span className={`rounded border px-2 py-0.5 font-mono text-[11px] font-bold ${DECISION_BADGE[region.decision] ?? DECISION_BADGE.COARSEN}`}>
          {region.decision}
        </span>
      </div>
      <dl className="space-y-1.5 font-mono text-xs">
        {rows.map(([label, value]) => (
          <div className="flex items-center justify-between" key={label}>
            <dt className="text-slate-400">{label}</dt>
            <dd className="font-semibold text-slate-200">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function RightInsightPanel({ budgetTotal, budgetUsed, onSelectRegion, regions, selectedRegion, selectedRegionId }) {
  return (
    <aside className="flex flex-col gap-4 lg:col-span-3">
      <ComputeBudgetGauge budgetTotal={budgetTotal} budgetUsed={budgetUsed} />
      <UtilityRanking onSelectRegion={onSelectRegion} regions={regions} selectedRegionId={selectedRegionId} />
      <SelectedRegionInspector region={selectedRegion} />
    </aside>
  );
}