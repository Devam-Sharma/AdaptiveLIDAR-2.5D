import { Radar } from "lucide-react";

const DECISION_COLOR = {
  REFINE: { stroke: "#22d3ee", fill: "rgba(34,211,238,0.14)", text: "#22d3ee", filter: "url(#glow-cyan)" },
  MAINTAIN: { stroke: "#22c55e", fill: "rgba(34,197,94,0.14)", text: "#22c55e", filter: "url(#glow-emerald)" },
  COARSEN: { stroke: "#64748b", fill: "rgba(100,116,139,0.12)", text: "#94a3b8", filter: "none" },
};

// Reuses the same 0-100 canvas coordinates AdaptiveMap draws from (see
// getRegionPosition in utilityCalculation.js) and re-projects them into a
// sensor-centric polar-looking view: origin at the bottom-center "sensor",
// spreading upward and outward. This is a genuine re-projection of real
// region positions, not a picture -- only the range rings, FOV cone, and
// road linework in the background are decorative scene-dressing.
function toRadarSpace(position) {
  return {
    x: 400 + (position.x - 50) * 4.4,
    y: 550 - position.y * 5,
  };
}

export default function RadarView({ onSelectRegion, regions, selectedRegionId }) {
  return (
    <div className="glass-panel relative flex flex-1 flex-col overflow-hidden !p-0">
      <div className="pointer-events-none absolute left-4 right-4 top-4 z-10 flex items-center justify-between font-mono text-xs">
        <div className="flex gap-2">
          <span className="rounded border border-line bg-obsidian/80 px-2 py-1 text-slate-300">2.5D SENSOR VIEW</span>
        </div>
        <div className="flex items-center gap-1.5 rounded border border-line bg-obsidian/80 px-2.5 py-1 text-cyanSignal">
          <Radar className="animate-pulse" size={12} />
          <span>{regions.length} TRACKED</span>
        </div>
      </div>

      <div className="radar-grid relative min-h-[420px] w-full flex-1">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 800 680" fill="none">
          <defs>
            <filter id="glow-cyan" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="glow-emerald" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <linearGradient id="fov-cone" x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.14" />
              <stop offset="80%" stopColor="#22d3ee" stopOpacity="0.02" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Decorative: range rings, FOV cone, sensor mount. Not derived from data. */}
          <circle cx="400" cy="550" r="160" stroke="#1c304a" strokeDasharray="4 4" strokeWidth="1" />
          <circle cx="400" cy="550" r="280" stroke="#1c304a" strokeDasharray="6 6" strokeWidth="1.2" />
          <circle cx="400" cy="550" r="420" stroke="#192b42" strokeWidth="1.2" />
          <path d="M400 520 L210 100 A450 450 0 0 1 590 100 Z" fill="url(#fov-cone)" stroke="#22d3ee" strokeOpacity="0.35" strokeWidth="1.5" />
          <g transform="translate(378, 520)">
            <polygon points="6,28 38,28 32,8 12,8" fill="rgba(34,211,238,0.2)" stroke="#22d3ee" strokeWidth="2" filter="url(#glow-cyan)" />
            <circle cx="22" cy="18" r="4" fill="#22d3ee" />
          </g>

          {/* Real regions, re-projected into radar space. */}
          {regions.map((region) => {
            const { x, y } = toRadarSpace(region.currentPosition);
            const color = DECISION_COLOR[region.decision] ?? DECISION_COLOR.COARSEN;
            const isSelected = selectedRegionId === region.id;
            return (
              <g key={region.id} className="cursor-pointer" onClick={() => onSelectRegion(region.id)}>
                <rect
                  x={x - 14}
                  y={y - 14}
                  width={28}
                  height={28}
                  rx={5}
                  fill={color.fill}
                  stroke={color.stroke}
                  strokeWidth={isSelected ? 3 : 1.8}
                  filter={color.filter}
                />
                <rect x={x - 32} y={y - 30} width={64} height={15} rx={3} fill="#0c1626" stroke={color.stroke} strokeWidth="0.8" />
                <text x={x} y={y - 19} fontFamily="'JetBrains Mono', monospace" fontSize="7.5" fontWeight="700" fill={color.text} textAnchor="middle">
                  {region.name.length > 14 ? `${region.name.slice(0, 13)}\u2026` : region.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <footer className="flex flex-wrap items-center justify-between border-t border-line bg-obsidian/60 px-5 py-3 font-mono text-xs text-slate-300">
        <div className="flex items-center gap-5">
          <span className="flex items-center gap-2"><span className="h-3 w-3 rounded border-2 border-cyanSignal bg-cyanSignal/20" /> Refine</span>
          <span className="flex items-center gap-2"><span className="h-3 w-3 rounded border-2 border-emerald-400 bg-emerald-400/20" /> Maintain</span>
          <span className="flex items-center gap-2"><span className="h-3 w-3 rounded border-2 border-slate-500 bg-slate-500/20" /> Coarsen</span>
        </div>
        <span className="italic text-slate-500">click a region to inspect</span>
      </footer>
    </div>
  );
}