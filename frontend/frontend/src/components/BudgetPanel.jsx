import { Database } from "lucide-react";
import { TOTAL_BUDGET } from "../data/simulationData.js";

export default function BudgetPanel({ budgetTotal, budgetUsed, isLive, onSelectRegion, regions, selectedRegionId }) {
  // The budget in force, not a frontend constant: in Live mode this is
  // metrics.budget straight from the backend (config.computational_budget),
  // which is a completely different magnitude from the simulation's 100,000.
  // The panel used to print the literal string "100,000" regardless.
  const total = budgetTotal ?? TOTAL_BUDGET;
  const allocated = regions.reduce((sum, region) => sum + region.cellsAllocated, 0);
  // In Live mode `regions` is the top-N most interesting cells, not every
  // active cell, so their sum understates real consumption. metrics.used_budget
  // is the true total, so prefer it for the headline utilization figure.
  const used = budgetUsed ?? allocated;
  const available = Math.max(0, total - used);
  const utilization = Math.min(100, Math.round((used / Math.max(total, 1e-6)) * 100));
  // Scale the per-region bars against the largest region on screen rather than
  // a magic 36000 that only made sense for the simulation's numbers.
  const barMax = Math.max(...regions.map((region) => region.cellsAllocated), 1);
  const unit = isLive ? "Budget Units" : "Map Cells";

  return (
    <div className="panel">
      <div className="section-title">
        <Database size={16} />
        Computational Budget
      </div>

      <p className="mb-3 text-[11px] leading-snug text-slate-500">
        Every tracked object costs a share of a fixed compute budget, based on how finely it's being resolved right
        now. This panel shows where that budget is actually going this frame — not where it was planned to go.
      </p>

      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="metric-label" title="The total compute ceiling the system can spend across all cells this frame.">Fixed budget</p>
          <h2 className="text-4xl font-black text-white">{Math.round(total).toLocaleString()}</h2>
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{unit}</span>
        </div>
        <Database className="text-cyanSignal" size={36} />
      </div>

      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-950" title="Percentage of the fixed budget currently in use.">
        <div className="h-full rounded-full bg-gradient-to-r from-cyanSignal to-stable" style={{ width: `${utilization}%` }} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div>
          <p className="metric-label cursor-help" title="How much of the fixed budget is spent on active cells right now.">{isLive ? "In use" : "Allocated"}</p>
          <b className="text-lg text-white">{Math.round(used).toLocaleString()}</b>
        </div>
        <div>
          <p className="metric-label cursor-help" title="Budget left over that could be spent refining another region if something becomes more important.">Available</p>
          <b className="text-lg text-white">{Math.round(available).toLocaleString()}</b>
        </div>
        <div>
          <p className="metric-label cursor-help" title="In-use budget as a percentage of the fixed total.">Utilization</p>
          <b className="text-lg text-white">{utilization}%</b>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {regions.map((region) => (
          <button
            className={`relative grid w-full grid-cols-[1fr_auto] overflow-hidden rounded-md border bg-slate-950/70 p-2 text-left text-sm transition ${
              selectedRegionId === region.id ? "border-cyanSignal/70" : "border-line hover:border-cyanSignal/50"
            }`}
            key={region.id}
            onClick={() => onSelectRegion(region.id)}
            title={`${region.name}: currently held at ${region.decision === "REFINE" ? "fine" : region.decision === "COARSEN" ? "coarse" : "medium"} resolution because of its safety relevance, motion, and uncertainty this frame.`}
            type="button"
          >
            <span className="z-10 text-slate-200">{region.name}</span>
            <b className="z-10 text-slate-100">{region.cellsAllocated.toLocaleString()}</b>
            <span className="absolute bottom-0 left-0 h-[2px] bg-cyanSignal shadow-glow" style={{ width: `${(region.cellsAllocated / barMax) * 100}%` }} />
          </button>
        ))}
      </div>

      <blockquote className="mt-4 border-l-2 border-cyanSignal pl-3 text-sm font-bold text-cyan-100">
        Resolution is allocated, not predetermined.
      </blockquote>
    </div>
  );
}