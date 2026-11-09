import { Zap } from "lucide-react";

const TIER_STYLE = {
  COARSE: { dot: "bg-blue-500 shadow-[0_0_6px_#3b82f6]" },
  MEDIUM: { dot: "bg-cyan-400 shadow-[0_0_6px_#22d3ee]" },
  FINE: { dot: "bg-amber-400 shadow-[0_0_6px_#fbbf24]" },
};

const TIER_MEANING = {
  COARSE: "Low-value regions (empty road, distant background). Cheapest to hold, so budget freed here funds refinement elsewhere.",
  MEDIUM: "Regions worth tracking but not urgent — moderate confidence, moderate motion.",
  FINE: "High-utility regions right now: close, moving, uncertain, or safety-critical objects that justify the extra cost.",
};

export default function ResolutionTiersCard({ resolutionLevels }) {
  // resolutionLevels arrives as [coarse, medium, fine] in metres -- the
  // actual ladder in force (backend config in Live mode), not three
  // hardcoded strings that could silently disagree with reality.
  const [coarse, medium, fine] = resolutionLevels?.length === 3 ? resolutionLevels : [0.5, 0.2, 0.05];
  const rows = [
    { label: "COARSE", meters: coarse },
    { label: "MEDIUM", meters: medium },
    { label: "FINE", meters: fine },
  ];

  return (
    <section className="rounded-xl border border-indigo-900/60 bg-[#0c1024]/80 p-4 shadow-lg" data-purpose="resolution-tiers-card">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center space-x-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300">
          <Zap className="text-cyan-400" size={13} />
          <span>Resolution tiers</span>
        </div>
        <span className="font-mono text-[10.5px] text-slate-400">Cost model / cell base cost</span>
      </div>
      <div className="space-y-2.5 font-mono text-xs">
        {rows.map((row) => (
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2" key={row.label}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <span className={`h-2.5 w-2.5 rounded-sm ${TIER_STYLE[row.label].dot}`} />
                <span className="text-[11px] font-semibold tracking-wide text-slate-200">{row.label}</span>
              </div>
              <span className="font-mono text-xs text-slate-300">{row.meters.toFixed(2)} m</span>
            </div>
            <p className="mt-1.5 pl-5 font-sans text-[10.5px] leading-snug text-slate-500">{TIER_MEANING[row.label]}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10.5px] italic text-slate-600">
        No cell is permanently assigned a tier — every frame, the budget allocator re-checks each region's utility and can move it up or down this ladder.
      </p>
    </section>
  );
}
