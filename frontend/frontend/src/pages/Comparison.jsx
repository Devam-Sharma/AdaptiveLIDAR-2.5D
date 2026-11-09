import { useEffect, useState } from "react";
import {
  AlertTriangle, CheckCircle2, ChevronsDown, Database, Grid3x3, Layers, Lightbulb, Sparkles,
} from "lucide-react";
import {
  getBaseline,
  getComputationalBenefit,
  getControlledExperiment,
  getRegionDecisions,
  getSameDistanceDemo,
  getWhy25D,
  resetComputationalBenefit,
} from "../api/backendClient.js";

// ---------------------------------------------------------------------------
// Static showcase: Conventional distance-based mapping vs. this project's
// predictive adaptive mapping. Both cards reuse the SAME photoreal night
// highway plate, so the ONLY visible difference is the overlay:
//   - Conventional: a uniform perspective grid, color-banded purely by depth.
//   - Predictive:   sparse cell clusters allocated only around what matters.
// ---------------------------------------------------------------------------

// Shared perspective model. All overlay geometry is expressed in a 0..100
// viewBox and converges to a single vanishing point tuned to the road plate.
const VP = { x: 48.8, y: 38.5 };   // vanishing point on the horizon
const BL = { x: 12, y: 100 };      // road bottom-left
const BR = { x: 90, y: 100 };      // road bottom-right
const lerp = (a, b, t) => a + (b - a) * t;
// n+1 evenly spaced values from a..b (n cells). Higher n = finer resolution.
const linspace = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
// A road-plane point at depth t (0 = near/bottom, 1 = far/horizon) and lateral
// position c (0 = left edge, 1 = right edge).
function corner(t, c) {
  const bx = lerp(BL.x, BR.x, c);
  const by = lerp(BL.y, BR.y, c);
  return { x: lerp(bx, VP.x, t), y: lerp(by, VP.y, t) };
}

// Fills the quads between successive rows/cols with a single tinted color.
function PerspectiveCells({ rows, cols, color, fillOpacity = 0.2, strokeOpacity = 0.55, strokeWidth = 0.16 }) {
  const quads = [];
  for (let i = 0; i < rows.length - 1; i += 1) {
    for (let j = 0; j < cols.length - 1; j += 1) {
      const p1 = corner(rows[i], cols[j]);
      const p2 = corner(rows[i], cols[j + 1]);
      const p3 = corner(rows[i + 1], cols[j + 1]);
      const p4 = corner(rows[i + 1], cols[j]);
      quads.push(`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`);
    }
  }
  return quads.map((points, k) => (
    <polygon fill={color} fillOpacity={fillOpacity} key={k} points={points} stroke={color} strokeOpacity={strokeOpacity} strokeWidth={strokeWidth} />
  ));
}

// Uniform distance-banded grid: red near, amber mid, green far. Resolution
// changes only with depth (fine near, coarse far) -- never with what's there.
function ConventionalGridOverlay() {
  return (
    <>
      {/* Near band (< 20 m) — HIGH resolution: many small cells */}
      <PerspectiveCells color="#f87171" cols={linspace(0, 1, 10)} fillOpacity={0.16} rows={linspace(0, 0.48, 5)} strokeOpacity={0.5} strokeWidth={0.14} />
      {/* Mid band (20–50 m) — MEDIUM resolution */}
      <PerspectiveCells color="#fbbf24" cols={linspace(0, 1, 6)} fillOpacity={0.18} rows={linspace(0.48, 0.7, 2)} strokeOpacity={0.55} strokeWidth={0.16} />
      {/* Far band (> 50 m) — LOW resolution: a few large cells */}
      <PerspectiveCells color="#34d399" cols={linspace(0, 1, 3)} fillOpacity={0.2} rows={linspace(0.7, 0.93, 1)} strokeOpacity={0.6} strokeWidth={0.2} />
    </>
  );
}

// Draws a rows x cols lattice of fine cells directly over an object's screen
// rectangle (all values in the shared 0..100 space). More rows/cols = higher
// allocated resolution, so a critical (dynamic) object gets a denser grid than
// a low-importance (static) one -- exactly what "adaptive allocation" means.
function ObjectCellGrid({ x, y, w, h, rows, cols, color, fillOpacity = 0.16, strokeOpacity = 0.9, strokeWidth = 0.16 }) {
  const cw = w / cols;
  const ch = h / rows;
  const cells = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      cells.push({ x: x + c * cw, y: y + r * ch });
    }
  }
  return cells.map((cell, i) => (
    <rect
      fill={color}
      fillOpacity={fillOpacity}
      height={ch}
      key={i}
      stroke={color}
      strokeOpacity={strokeOpacity}
      strokeWidth={strokeWidth}
      width={cw}
      x={cell.x}
      y={cell.y}
    />
  ));
}

// Adaptive allocation: almost nothing on empty road (a barely-there coarse
// scatter = "unallocated"), then cell lattices placed ON each detected object.
// Cell density encodes resolution/importance:
//   Pedestrian (near) / Truck -> HIGH   (red, dense fine grid)  [dynamic / critical]
//   Car                       -> MEDIUM (amber, moderate grid)  [relevant object]
//   Building / Sign           -> LOW    (blue, coarse cells)    [static / background]
function AdaptiveGridOverlay() {
  return (
    <>
      {/* unallocated empty regions — barely-there coarse grid on the road */}
      <PerspectiveCells color="#64748b" cols={[0, 0.25, 0.5, 0.75, 1]} fillOpacity={0.03} rows={[0, 0.4, 0.7, 0.9]} strokeOpacity={0.1} strokeWidth={0.08} />

      {/* --- DYNAMIC (high resolution, dense red cells) --- */}
      {/* Truck — high importance, dense fine grid */}
      <ObjectCellGrid color="#f87171" cols={4} h={7} rows={5} w={6.5} x={42.5} y={44} />
      {/* Pedestrian (near) — high importance, dense fine grid */}
      <ObjectCellGrid color="#f87171" cols={2} h={13} rows={6} w={4} x={15} y={60} />

      {/* --- MEDIUM (relevant object, moderate amber cells) --- */}
      {/* Car — relevant, medium-density grid */}
      <ObjectCellGrid color="#fbbf24" cols={3} h={8.5} rows={3} w={8} x={50.5} y={57} />

      {/* --- STATIC (low resolution, coarse blue cells) --- */}
      {/* Building — static, a single coarse cell */}
      <ObjectCellGrid color="#38bdf8" cols={1} h={26} rows={1} w={15} x={78} y={26} />
      {/* Roadside sign — near but static, still gets coarse cells */}
      <ObjectCellGrid color="#38bdf8" cols={1} h={16} rows={2} w={6} x={82} y={63} />
    </>
  );
}

// Self-contained night-highway backdrop, drawn entirely in SVG in the same
// 0..100 viewBox the overlays use (VP / BL / BR). No external image.
function SceneBackdrop() {
  // center-line dashes marching toward the vanishing point
  const dashes = Array.from({ length: 8 }, (_, i) => {
    const t = i / 8;
    const p = corner(t, 0.5);
    const w = lerp(1.8, 0.15, t);
    const h = lerp(3.2, 0.3, t);
    return { x: p.x - w / 2, y: p.y - h, w, h, o: lerp(0.75, 0.15, t) };
  });

  const stars = [
    [14, 10], [22, 16], [33, 8], [41, 14], [58, 9],
    [67, 15], [78, 11], [86, 18], [50, 6], [30, 20], [72, 22],
  ];

  return (
    <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
      <defs>
        <linearGradient id="sceneSky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#0a1022" />
          <stop offset="70%" stopColor="#131d38" />
          <stop offset="100%" stopColor="#0c1327" />
        </linearGradient>
        <linearGradient id="sceneGround" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#0a0f1e" />
          <stop offset="100%" stopColor="#05070f" />
        </linearGradient>
        <linearGradient id="sceneRoad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#161c2b" />
          <stop offset="100%" stopColor="#262c3c" />
        </linearGradient>
        <radialGradient id="sceneLamp" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fde68a" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#fde68a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="sceneHead" cx="50%" cy="100%" r="75%">
          <stop offset="0%" stopColor="#cfe0ff" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#cfe0ff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* sky + ground split at the horizon (VP.y = 38.5) */}
      <rect fill="url(#sceneSky)" height="38.5" width="100" x="0" y="0" />
      <rect fill="url(#sceneGround)" height="61.5" width="100" x="0" y="38.5" />

      {/* stars */}
      {stars.map(([x, y], i) => (
        <circle cx={x} cy={y} fill="#e2e8f0" key={i} opacity={0.5} r={0.25} />
      ))}

      {/* distant tree line / hills silhouette along the horizon */}
      <path d="M0,38.5 Q10,33 20,37 T40,36 T60,37 T80,35 T100,38 L100,42 L0,42 Z" fill="#070b16" opacity="0.9" />

      {/* road surface converging to the vanishing point */}
      <polygon fill="url(#sceneRoad)" points="10,100 92,100 48.8,38.5" />

      {/* road edge lines */}
      <line opacity="0.55" stroke="#64748b" strokeWidth="0.35" x1="10" x2="48.8" y1="100" y2="38.5" />
      <line opacity="0.55" stroke="#64748b" strokeWidth="0.35" x1="92" x2="48.8" y1="100" y2="38.5" />

      {/* lane dividers */}
      <line opacity="0.18" stroke="#94a3b8" strokeWidth="0.2" x1="33" x2="48.8" y1="100" y2="38.5" />
      <line opacity="0.18" stroke="#94a3b8" strokeWidth="0.2" x1="69" x2="48.8" y1="100" y2="38.5" />

      {/* dashed center line */}
      {dashes.map((d, i) => (
        <rect fill="#e2e8f0" height={d.h} key={i} opacity={d.o} rx={0.1} width={d.w} x={d.x} y={d.y} />
      ))}

      {/* our own car's headlight wash at the bottom center */}
      <ellipse cx="51" cy="100" fill="url(#sceneHead)" rx="26" ry="34" />
    </svg>
  );
}

// Backdrop + overlay layer. Overlay geometry stays aligned to the road.
function SceneMedia({ overlay, children }) {
  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-950">
      <SceneBackdrop />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/50 via-transparent to-slate-950/10" />
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
        {overlay}
      </svg>
      {children}
    </div>
  );
}

// A labeled bounding box positioned directly in container-percentage space.
function SceneBox({ x, y, w, h, color, label, sub }) {
  return (
    <div className="absolute" style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` }}>
      <div className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-black/85 px-1.5 py-0.5 text-center text-[10px] font-bold leading-tight text-white">
        {label}<br /><span className="font-mono font-semibold">({sub})</span>
      </div>
      <div className="h-full w-full rounded-sm border-2" style={{ borderColor: color, boxShadow: `0 0 10px 0 ${color}66` }} />
    </div>
  );
}

// Far / Mid / Near key, overlaid inside the conventional scene on the left.
function ZoneLegendOverlay() {
  const rows = [
    { color: "#34d399", title: "Far", range: "(> 50 m)", res: "Low resolution" },
    { color: "#fbbf24", title: "Mid", range: "(20 – 50 m)", res: "Medium resolution" },
    { color: "#f87171", title: "Near", range: "(< 20 m)", res: "High resolution" },
  ];
  return (
    <div className="absolute left-3 top-0 flex h-full flex-col justify-center gap-7">
      {rows.map((r) => (
        <div className="flex items-start gap-2" key={r.title}>
          <span className="mt-0.5 h-10 w-1 rounded-full" style={{ background: r.color }} />
          <div className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
            <div className="text-sm font-bold leading-tight text-white">{r.title}</div>
            <div className="text-[11px] text-slate-200">{r.range}</div>
            <div className="text-[11px] text-slate-400">{r.res}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CellImportanceLegend() {
  const rows = [
    { color: "#f87171", label: "High (dynamic / critical)" },
    { color: "#fbbf24", label: "Medium (relevant object)" },
    { color: "#38bdf8", label: "Low (static / background)" },
    { color: "#64748b", label: "Unallocated (empty region)" },
  ];
  return (
    <div className="absolute right-2 top-2 rounded-lg border border-line/60 bg-slate-950/85 p-2.5 backdrop-blur-sm">
      <div className="mb-1.5 text-[11px] font-bold text-white">Cell Importance</div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div className="flex items-center gap-1.5 text-[10px] text-slate-300" key={r.label}>
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: r.color }} />
            {r.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function ResourceUsageBar({ tone, pct, note }) {
  const barColor = tone === "red" ? "bg-rose-500" : "bg-cyanSignal";
  return (
    <div className="rounded-lg border border-line bg-black/20 p-3">
      <div className="text-sm font-bold text-white">Resource Usage</div>
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 text-xs text-slate-400">{note}</div>
    </div>
  );
}

function BulletCard({ tone, icon, title, items }) {
  const toneClass = tone === "red" ? "text-rose-400" : "text-emerald-400";
  const dotClass = tone === "red" ? "bg-rose-400" : "bg-emerald-400";
  return (
    <div className="rounded-lg border border-line bg-black/20 p-3">
      <div className={`flex items-center gap-1.5 text-sm font-bold ${toneClass}`}>{icon} {title}</div>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li className="flex items-start gap-2 text-xs text-slate-300" key={item}>
            <span className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${dotClass}`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Scene objects -------------------------------------------------------
// Each sprite is a self-contained SVG placed by container-% CENTER point, so
// it nests inside the matching bounding box. Own viewBox => no stretching.
function ObjectSprite({ cx, cy, w, viewBox, glow, children }) {
  return (
    <div
      className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${cx}%`, top: `${cy}%`, width: `${w}%` }}
    >
      <svg className="h-auto w-full" style={glow ? { filter: `drop-shadow(0 0 3px ${glow})` } : undefined} viewBox={viewBox}>
        {children}
      </svg>
    </div>
  );
}

function EgoCar({ cx = 51, cy = 95, w = 24 }) {
  return (
    <ObjectSprite cx={cx} cy={cy} glow="#ef4444" viewBox="0 0 120 74" w={w}>
      <ellipse cx="60" cy="69" fill="#000" opacity="0.5" rx="52" ry="6" />
      <path d="M12 46 Q14 30 30 26 L90 26 Q106 30 108 46 L110 60 Q110 66 104 66 L16 66 Q10 66 10 60 Z" fill="#1e2636" />
      <path d="M34 27 Q38 16 60 15 Q82 16 86 27 Z" fill="#0f1626" />
      <path d="M39 27 Q43 20 60 19 Q77 20 81 27 Z" fill="#22304a" />
      <rect fill="#ef4444" height="9" rx="3" width="26" x="15" y="44" />
      <rect fill="#ef4444" height="9" rx="3" width="26" x="79" y="44" />
      <rect fill="#0b1120" height="6" rx="1.5" width="20" x="50" y="56" />
    </ObjectSprite>
  );
}

function TruckSprite({ cx, cy, w }) {
  return (
    <ObjectSprite cx={cx} cy={cy} glow="#ef4444" viewBox="0 0 70 92" w={w}>
      <rect fill="#232b3d" height="66" rx="3" stroke="#334155" strokeWidth="2" width="50" x="10" y="6" />
      <rect fill="#0f1626" height="8" width="12" x="18" y="58" />
      <rect fill="#0f1626" height="8" width="12" x="40" y="58" />
      <rect fill="#1a2230" height="14" rx="2" width="44" x="13" y="72" />
      <circle cx="22" cy="88" fill="#ef4444" r="4" />
      <circle cx="48" cy="88" fill="#ef4444" r="4" />
    </ObjectSprite>
  );
}

function CarSprite({ cx, cy, w }) {
  return (
    <ObjectSprite cx={cx} cy={cy} glow="#ef4444" viewBox="0 0 96 66" w={w}>
      <ellipse cx="48" cy="61" fill="#000" opacity="0.5" rx="42" ry="5" />
      <path d="M8 40 Q10 26 24 22 L72 22 Q86 26 88 40 L90 52 Q90 58 84 58 L12 58 Q6 58 6 52 Z" fill="#20293a" />
      <path d="M26 23 Q30 13 48 12 Q66 13 70 23 Z" fill="#101827" />
      <path d="M30 23 Q34 17 48 16 Q62 17 66 23 Z" fill="#26324a" />
      <rect fill="#ef4444" height="8" rx="2.5" width="18" x="12" y="38" />
      <rect fill="#ef4444" height="8" rx="2.5" width="18" x="66" y="38" />
    </ObjectSprite>
  );
}

// A pedestrian standing on the side of the road (dynamic / critical).
function PedestrianSprite({ cx, cy, w }) {
  return (
    <ObjectSprite cx={cx} cy={cy} glow="#ef4444" viewBox="0 0 30 86" w={w}>
      <ellipse cx="15" cy="82" fill="#000" opacity="0.4" rx="9" ry="3" />
      <circle cx="15" cy="11" fill="#1e2636" r="7" />
      <rect fill="#2b3444" height="28" rx="5" width="14" x="8" y="19" />
      <rect fill="#1a2230" height="28" rx="3" width="5" x="9" y="47" />
      <rect fill="#1a2230" height="28" rx="3" width="5" x="16" y="47" />
      <circle cx="15" cy="30" fill="#ef4444" r="2.4" />
    </ObjectSprite>
  );
}

// A building on the side of the road (static / background).
function BuildingSprite({ cx, cy, w }) {
  const windows = [];
  for (let r = 0; r < 6; r += 1) {
    for (let c = 0; c < 3; c += 1) windows.push([c, r]);
  }
  return (
    <ObjectSprite cx={cx} cy={cy} glow="#1e3a5f" viewBox="0 0 60 120" w={w}>
      <rect fill="#0f1626" height="6" rx="1" width="56" x="2" y="4" />
      <rect fill="#141c2e" height="112" rx="2" stroke="#243044" strokeWidth="2" width="52" x="4" y="8" />
      {windows.map(([c, r], i) => {
        const lit = (r * 3 + c) % 3 === 0;
        return (
          <rect
            key={i}
            x={11 + c * 14}
            y={18 + r * 16}
            width={9}
            height={10}
            rx="1"
            fill={lit ? "#fde68a" : "#1f2b40"}
            opacity={lit ? 0.85 : 1}
          />
        );
      })}
    </ObjectSprite>
  );
}

// A roadside information sign standing near the ego (static / background),
// but physically CLOSE -- the case where a pure distance rule wastes high
// resolution on something that doesn't matter.
function SignSprite({ cx, cy, w }) {
  return (
    <ObjectSprite cx={cx} cy={cy} viewBox="0 0 30 80" w={w}>
      <ellipse cx="15" cy="77" fill="#000" opacity="0.4" rx="7" ry="2.5" />
      <rect fill="#3b4759" height="52" width="2.6" x="13.7" y="26" />
      <rect fill="#1f2b40" height="22" rx="2" stroke="#64748b" strokeWidth="1.5" width="26" x="2" y="4" />
      <rect fill="#334155" height="4" rx="1" width="16" x="7" y="9" />
      <rect fill="#334155" height="4" rx="1" width="12" x="7" y="16" />
    </ObjectSprite>
  );
}

function ConventionalCard() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border-2 border-rose-500/40 bg-slate-950">
      <div className="flex items-center justify-between border-b border-rose-500/20 bg-rose-500/5 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-rose-500/15 text-rose-300"><Grid3x3 size={16} /></span>
          <div>
            <div className="text-sm font-bold text-white">Conventional Distance-Based Mapping</div>
            <div className="text-xs text-slate-400">Fixed resolution allocation by distance thresholds</div>
          </div>
        </div>
        <span className="hidden shrink-0 items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-[11px] font-bold text-rose-300 sm:flex">
          <Grid3x3 size={12} /> Static Zones
        </span>
      </div>

      <SceneMedia overlay={<ConventionalGridOverlay />}>
        <ZoneLegendOverlay />
        <BuildingSprite cx={85.5} cy={40} w={16} />
        <SignSprite cx={85} cy={71} w={5} />
        <EgoCar />
        <TruckSprite cx={45.75} cy={47.5} w={5.5} />
        <CarSprite cx={54.5} cy={61} w={7} />
        <PedestrianSprite cx={17} cy={66.5} w={3.4} />
        {/* distance-band coloring: far=green, mid=amber, near=red */}
        <SceneBox color="#34d399" h={7} label="Truck" sub="70 m" w={6.5} x={42.5} y={44} />
        <SceneBox color="#fbbf24" h={8.5} label="Car" sub="40 m" w={8} x={50.5} y={57} />
        <SceneBox color="#f87171" h={13} label="Pedestrian" sub="15 m" w={4} x={15} y={60} />
        {/* near static sign — pure distance rule still forces HIGH res */}
        <SceneBox color="#f87171" h={16} label="Sign" sub="8 m" w={6} x={82} y={63} />
        {/* building shown as static (blue) in both views */}
        <SceneBox color="#38bdf8" h={26} label="Building" sub="static" w={15} x={78} y={26} />
      </SceneMedia>

      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <BulletCard
          icon={<AlertTriangle size={14} />}
          items={[
            "Uniform allocation within distance bands",
            "Wastes computation on empty regions",
            "Misses important distant objects",
            "Cannot adapt to scene complexity",
          ]}
          title="Limitations"
          tone="red"
        />
        <ResourceUsageBar note="Higher compute, lower efficiency" pct={88} tone="red" />
      </div>
    </div>
  );
}

function PredictiveCard() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border-2 border-cyanSignal/40 bg-slate-950">
      <div className="flex items-center justify-between border-b border-cyanSignal/20 bg-cyanSignal/5 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-cyanSignal/15 text-cyanSignal"><Layers size={16} /></span>
          <div>
            <div className="text-sm font-bold text-white">Predictive Adaptive 2.5D Mapping</div>
            <div className="text-xs text-slate-400">Adaptive allocation based on scene understanding</div>
          </div>
        </div>
        <span className="hidden shrink-0 items-center gap-1 rounded-full border border-cyanSignal/40 bg-cyanSignal/10 px-2.5 py-1 text-[11px] font-bold text-cyanSignal sm:flex">
          <Sparkles size={12} /> Adaptive Allocation
        </span>
      </div>

      <SceneMedia overlay={<AdaptiveGridOverlay />}>
        <BuildingSprite cx={85.5} cy={40} w={16} />
        <SignSprite cx={85} cy={71} w={5} />
        <EgoCar />
        <TruckSprite cx={45.75} cy={47.5} w={5.5} />
        <CarSprite cx={54.5} cy={61} w={7} />
        <PedestrianSprite cx={17} cy={66.5} w={3.4} />
        {/* dynamic = red / high res */}
        <SceneBox color="#f87171" h={7} label="Truck" sub="70 m" w={6.5} x={42.5} y={44} />
        {/* pedestrian near = red / high res */}
        <SceneBox color="#f87171" h={13} label="Pedestrian" sub="15 m" w={4} x={15} y={60} />
        {/* relevant vehicle = amber / medium res */}
        <SceneBox color="#fbbf24" h={8.5} label="Car" sub="40 m" w={8} x={50.5} y={57} />
        {/* static = blue / low res (building + near roadside sign) */}
        <SceneBox color="#38bdf8" h={26} label="Building" sub="static" w={15} x={78} y={26} />
        <SceneBox color="#38bdf8" h={16} label="Sign" sub="static" w={6} x={82} y={63} />
        <CellImportanceLegend />
      </SceneMedia>

      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <BulletCard
          icon={<CheckCircle2 size={14} />}
          items={[
            "Allocates more cells to important objects",
            "Fewer cells in empty / unimportant areas",
            "Captures distant objects using prediction",
            "Adapts in real-time to scene changes",
            "Better perception with lower compute cost",
          ]}
          title="Key Improvements"
          tone="green"
        />
        <ResourceUsageBar note="Lower compute, higher efficiency" pct={38} tone="cyan" />
      </div>
    </div>
  );
}

function StatChip({ icon, label, tone, value }) {
  const toneClass = tone === "red" ? "bg-rose-500/15 text-rose-300" : "bg-cyanSignal/15 text-cyanSignal";
  const valueClass = tone === "red" ? "text-rose-300" : "text-cyanSignal";
  return (
    <div className="flex items-center gap-2.5">
      <span className={`flex h-9 w-9 items-center justify-center rounded-md ${toneClass}`}>{icon}</span>
      <div>
        <div className="text-xs text-slate-400">{label}</div>
        <div className={`font-mono text-xl font-black ${valueClass}`}>{value}</div>
      </div>
    </div>
  );
}

function ComparisonStatsFooter() {
  return (
    <div className="grid gap-4 rounded-xl border border-line bg-black/20 p-4 md:grid-cols-[1fr_auto_1fr]">
      <div className="flex flex-wrap items-center gap-6">
        <StatChip icon={<Grid3x3 size={16} />} label="Total Grid Cells" tone="red" value="24,000" />
        <StatChip icon={<Database size={16} />} label="Estimated Memory" tone="red" value="120 MB" />
      </div>
      <div className="flex items-center justify-center">
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-slate-900 text-xs font-black text-slate-400">VS</span>
      </div>
      <div className="flex flex-wrap items-center gap-6 md:justify-end">
        <StatChip icon={<Grid3x3 size={16} />} label="Total Grid Cells" tone="cyan" value="8,400" />
        <StatChip icon={<Database size={16} />} label="Estimated Memory" tone="cyan" value="46 MB" />
        <span className="flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-sm font-black text-emerald-400">
          <ChevronsDown size={14} /> 62%
        </span>
      </div>
    </div>
  );
}

function MappingComparisonShowcase() {
  return (
    <div className="grid gap-4">
      <div className="grid items-stretch gap-4 xl:grid-cols-2">
        <ConventionalCard />
        <PredictiveCard />
      </div>
      <ComparisonStatsFooter />
      <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <Lightbulb className="mt-0.5 shrink-0 text-amber-300" size={18} />
        <p className="text-sm text-amber-100">
          <span className="font-bold">Key Insight:</span>{" "}
          Our predictive adaptive mapping focuses computational resources only where they are
          needed, enabling better scene understanding with fewer cells and lower compute cost.
        </p>
      </div>
    </div>
  );
}

// A3: Baseline Benchmark Mode -- real measured proposed/uniform/distance-based
// comparison for whatever frame the backend last processed. Polls
// GET /api/baseline (cheap, no side effects) while this page is open and the
// backend is live.
function LiveBaselineComparison({ isLive }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isLive) { setData(null); setError(null); return; }
    let cancelled = false;
    const poll = () => {
      getBaseline()
        .then((payload) => { if (!cancelled) { setData(payload); setError(null); } })
        .catch((err) => { if (!cancelled) setError(err.message); });
    };
    poll();
    const interval = window.setInterval(poll, 2000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [isLive]);

  if (!isLive) {
    return (
      <p className="text-sm text-slate-500">
        Switch to Live Backend to see this computed for real from the current frame's actual regions.
      </p>
    );
  }
  if (error) return <p className="text-sm text-rose-400">Backend unreachable: {error}</p>;
  if (!data || !data.proposed || Object.keys(data.proposed).length === 0) {
    return <p className="text-sm text-slate-500">{data?.note ?? "Waiting for a processed frame..."}</p>;
  }

  const columns = [
    { key: "proposed", label: "Proposed (this project)" },
    { key: "uniform", label: "Uniform (finest everywhere)" },
    { key: "distance_based", label: "Distance-based only" },
  ];
  const metricRows = [
    ["active_cells", "Active regions considered"],
    ["estimated_cell_objects", "Estimated cell objects needed"],
    ["avg_resolution_m", "Avg resolution (m)"],
    ["avg_resolution_important_regions_m", "Avg resolution, important regions (m)"],
    ["important_region_count", "Important regions (importance \u2265 0.5)"],
  ];

  return (
    <div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border-b border-line pb-2 text-left text-xs uppercase tracking-wide text-slate-500">Metric</th>
            {columns.map((c) => (
              <th className="border-b border-line pb-2 text-right text-xs uppercase tracking-wide text-slate-500" key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metricRows.map(([field, label]) => (
            <tr key={field}>
              <td className="border-b border-slate-800/60 py-2 text-slate-400">{label}</td>
              {columns.map((c) => {
                const v = data[c.key]?.[field];
                return (
                  <td className="border-b border-slate-800/60 py-2 text-right font-mono text-slate-100" key={c.key}>
                    {v == null ? "\u2014" : v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs leading-5 text-slate-500">{data.note}</p>
    </div>
  );
}

// D1: Same-Distance, Different-Resolution demonstration. On-demand probe
// (GET /api/demo/same_distance) -- doesn't need a live frame first, it
// builds its own two synthetic regions on the backend.
function SameDistanceProbe({ isLive }) {
  const [distance, setDistance] = useState(15);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = () => {
    setLoading(true);
    setError(null);
    getSameDistanceDemo(distance)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (isLive) run(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [isLive]);

  if (!isLive) {
    return (
      <p className="text-sm text-slate-500">
        Switch to Live Backend to run this probe against the real allocator.
      </p>
    );
  }

  const card = (result, accent) => (
    <div className={`rounded-md border border-line bg-slate-950/60 p-3 ${accent}`}>
      <div className="text-xs font-bold uppercase tracking-wide text-slate-400">{result.semantic_class}</div>
      <div className="mt-1 text-sm text-slate-300">Distance: {result.distance_from_sensor.toFixed(2)} m</div>
      <div className="text-sm text-slate-300">Resolution: {result.resolution_before} m &rarr; {result.resolution_after} m</div>
      <div className="text-sm text-slate-300">Utility: {result.utility.toFixed(3)}</div>
      <div className="mt-1 text-base font-black">{result.decision}</div>
    </div>
  );

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <label className="text-xs text-slate-500" htmlFor="probe-distance">Shared distance (m)</label>
        <input
          className="w-20 rounded border border-line bg-slate-900 px-2 py-1 text-sm text-slate-100"
          id="probe-distance"
          onChange={(e) => setDistance(Number(e.target.value))}
          type="number"
          value={distance}
        />
        <button className="control-button" disabled={loading} onClick={run} type="button">
          {loading ? "Running\u2026" : "Run probe"}
        </button>
      </div>
      {error && <p className="text-sm text-rose-400">Backend unreachable: {error}</p>}
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {card(data.pedestrian, "border-l-4 border-l-fuchsia-500")}
            {card(data.static, "border-l-4 border-l-slate-600")}
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            distance_is_identical: <strong className="text-slate-300">{String(data.distance_is_identical)}</strong>
            {" \u00b7 "}decisions_differ: <strong className="text-slate-300">{String(data.decisions_differ)}</strong>
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">{data.claim}</p>
        </>
      )}
    </div>
  );
}

// D2: Measured Computational Benefit -- A3's baseline comparison
// accumulated as a RUNNING experiment across every frame processed since
// the last reset, rather than one frame's snapshot. Polls
// GET /api/demo/computational_benefit (cheap, no side effects); the
// numbers accumulate automatically as frames advance elsewhere in the app,
// this just reads them.
function MeasuredComputationalBenefit({ isLive }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!isLive) { setData(null); setError(null); return; }
    let cancelled = false;
    const poll = () => {
      getComputationalBenefit()
        .then((payload) => { if (!cancelled) { setData(payload); setError(null); } })
        .catch((err) => { if (!cancelled) setError(err.message); });
    };
    poll();
    const interval = window.setInterval(poll, 2000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [isLive]);

  const handleReset = () => {
    setResetting(true);
    resetComputationalBenefit()
      .then(() => getComputationalBenefit())
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setResetting(false));
  };

  if (!isLive) {
    return (
      <p className="text-sm text-slate-500">
        Switch to Live Backend to accumulate this measurement across real processed frames.
      </p>
    );
  }
  if (error) return <p className="text-sm text-rose-400">Backend unreachable: {error}</p>;

  const columns = [
    { key: "proposed", label: "Proposed (this project)" },
    { key: "uniform", label: "Uniform (finest everywhere)" },
    { key: "distance_based", label: "Distance-based only" },
  ];
  const metricRows = [
    ["avg_estimated_cell_objects", "Avg estimated cell objects / frame"],
    ["avg_active_cells", "Avg active regions considered / frame"],
    ["avg_avg_resolution_m", "Avg resolution (m)"],
    ["critical_region_fine_resolution_rate", "Critical regions kept at finest res (%)"],
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="text-sm text-slate-300">
          Frames measured: <span className="font-mono font-bold text-cyan-200">{data?.frames_measured ?? 0}</span>
          {" \u00b7 "}
          Critical regions observed: <span className="font-mono font-bold text-cyan-200">{data?.critical_regions_observed ?? 0}</span>
        </div>
        <button className="control-button ml-auto" disabled={resetting} onClick={handleReset} type="button">
          {resetting ? "Resetting\u2026" : "Reset experiment"}
        </button>
      </div>
      {!data || data.frames_measured === 0 ? (
        <p className="text-sm text-slate-500">{data?.note ?? "Advance some frames to accumulate this measurement."}</p>
      ) : (
        <>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-line pb-2 text-left text-xs uppercase tracking-wide text-slate-500">Metric</th>
                {columns.map((c) => (
                  <th className="border-b border-line pb-2 text-right text-xs uppercase tracking-wide text-slate-500" key={c.key}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metricRows.map(([field, label]) => (
                <tr key={field}>
                  <td className="border-b border-slate-800/60 py-2 text-slate-400">{label}</td>
                  {columns.map((c) => {
                    const raw = data.methods?.[c.key]?.[field];
                    const display = raw == null
                      ? "\u2014"
                      : field === "critical_region_fine_resolution_rate"
                        ? `${Math.round(raw * 100)}%`
                        : Number(raw).toFixed(field === "avg_active_cells" ? 1 : 2);
                    return (
                      <td className="border-b border-slate-800/60 py-2 text-right font-mono text-slate-100" key={c.key}>
                        {display}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs leading-5 text-slate-500">{data.note}</p>
        </>
      )}
    </div>
  );
}

// D5: Why 2.5D -- contrasts this project's actual active-cell
// representation (elevation + occupancy/semantic/motion/uncertainty
// attached to one object per footprint) against what a dense 3D voxel
// grid would need at the same (x, y) resolution. Polls
// GET /api/demo/why_2_5d against whatever regions are active right now.
function Why25DPanel({ isLive }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isLive) { setData(null); setError(null); return; }
    let cancelled = false;
    const poll = () => {
      getWhy25D()
        .then((payload) => { if (!cancelled) { setData(payload); setError(null); } })
        .catch((err) => { if (!cancelled) setError(err.message); });
    };
    poll();
    const interval = window.setInterval(poll, 3000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [isLive]);

  if (!isLive) {
    return (
      <p className="text-sm text-slate-500">
        Switch to Live Backend to compute this from the map's real active regions.
      </p>
    );
  }
  if (error) return <p className="text-sm text-rose-400">Backend unreachable: {error}</p>;
  if (!data || !data.active_cell_count) {
    return <p className="text-sm text-slate-500">Waiting for active regions...</p>;
  }

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-line bg-slate-950/60 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">2.5D active cells (real)</div>
          <div className="mt-1 font-mono text-2xl font-black text-cyan-200">{data.active_cell_count}</div>
        </div>
        <div className="rounded-md border border-line bg-slate-950/60 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">Dense 3D voxel equivalent</div>
          <div className="mt-1 font-mono text-2xl font-black text-amber-300">{data.dense_3d_equivalent_voxel_count}</div>
        </div>
        <div className="rounded-md border border-line bg-slate-950/60 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">Voxels needed per cell</div>
          <div className="mt-1 font-mono text-2xl font-black text-white">
            {data.voxel_to_cell_ratio == null ? "\u2014" : `${data.voxel_to_cell_ratio.toFixed(1)}\u00d7`}
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs leading-5 text-slate-500">{data.explanation}</p>
    </div>
  );
}

// D7: Region-by-Region Decision Explanation -- five archetypal regions
// (empty road, building, road edge/obstacle, moving vehicle, pedestrian)
// run through the real allocation pipeline in one call. A self-contained
// probe (like D1's), so it re-runs on demand rather than needing live
// frames to be advancing.
function RegionDecisionExplanationPanel({ isLive }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = () => {
    setLoading(true);
    getRegionDecisions()
      .then((payload) => { setData(payload); setError(null); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isLive) run();
    else { setData(null); setError(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive]);

  if (!isLive) {
    return <p className="text-sm text-slate-500">Switch to Live Backend to run this probe against the real pipeline.</p>;
  }

  const decisionStyle = (decision) => (
    decision === "REFINE" ? "bg-emerald-500/20 text-emerald-300"
      : decision === "COARSEN" ? "bg-rose-500/20 text-rose-300"
        : "bg-slate-500/20 text-slate-300"
  );

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-400">
          Five archetypal regions, one call through the real scoring/allocation pipeline.
        </p>
        <button className="control-button" disabled={loading} onClick={run} type="button">
          {loading ? "Running\u2026" : "Re-run probe"}
        </button>
      </div>
      {error && <p className="text-sm text-rose-400">Backend unreachable: {error}</p>}
      {data && (
        <>
          <div className="grid gap-3 md:grid-cols-5">
            {data.regions.map((r) => (
              <div className="rounded-lg border border-line bg-black/20 p-3" key={r.key}>
                <div className="text-sm font-bold text-white">{r.label}</div>
                <div className="mt-0.5 text-[11px] text-slate-500">{r.semantic_class}</div>
                <div className={`mt-2 inline-block rounded px-2 py-0.5 text-[11px] font-bold ${decisionStyle(r.decision)}`}>
                  {r.decision}
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Utility</span>
                  <span className="font-mono text-cyan-200">{r.utility.toFixed(3)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Resolution</span>
                  <span className="font-mono text-slate-200">{r.resolution_before}&rarr;{r.resolution_after}</span>
                </div>
                <div className="mt-2 space-y-0.5 text-[10px] text-slate-500">
                  <div className="flex justify-between"><span>Safety/semantic</span><span className="font-mono">{r.signals.safety_semantic_relevance.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Motion</span><span className="font-mono">{r.signals.motion.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Uncertainty</span><span className="font-mono">{r.signals.uncertainty.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Geometry</span><span className="font-mono">{r.signals.geometric_complexity.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Future relevance</span><span className="font-mono">{r.signals.future_relevance.toFixed(2)}</span></div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">{data.claim}</p>
        </>
      )}
    </div>
  );
}

// D8: Judge-Ready Controlled Experiment -- reruns D1 and D7's probes at
// several different inputs each, folds in this session's own live D2
// numbers, and lets the team export the raw report as a JSON file to
// defend the numbers during judging.
function ControlledExperimentPanel({ isLive }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = () => {
    setLoading(true);
    getControlledExperiment()
      .then((payload) => { setData(payload); setError(null); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  const exportEvidence = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `foveamap_controlled_experiment_${Math.round(data.generated_at)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (!isLive) {
    return <p className="text-sm text-slate-500">Switch to Live Backend to run the controlled experiment.</p>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button className="control-button" disabled={loading} onClick={run} type="button">
          {loading ? "Running\u2026" : "Run controlled experiment"}
        </button>
        <button className="control-button" disabled={!data} onClick={exportEvidence} type="button">
          Export evidence (JSON)
        </button>
      </div>
      {error && <p className="text-sm text-rose-400">Backend unreachable: {error}</p>}
      {!data ? (
        <p className="text-sm text-slate-500">
          Runs D1&apos;s same-distance probe at 5 distances and D7&apos;s archetype probe at 3
          position scales, plus this session&apos;s own live D2 numbers, into one downloadable
          report.
        </p>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-line bg-black/20 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">Same-distance experiment (5 trials)</div>
              <div className="mt-1 font-mono text-xl font-black text-cyan-200">
                {Math.round(data.same_distance_experiment.pass_rate * 100)}% pass
              </div>
              <table className="mt-2 w-full border-collapse text-[11px]">
                <thead>
                  <tr>
                    {["Distance", "Ped.", "Static", "Differ?"].map((h) => (
                      <th className="border-b border-line pb-1 text-left uppercase text-slate-500" key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.same_distance_experiment.trials.map((t) => (
                    <tr key={t.distance}>
                      <td className="border-b border-slate-800/60 py-1 font-mono text-slate-300">{t.distance}m</td>
                      <td className="border-b border-slate-800/60 py-1 text-slate-300">{t.pedestrian_decision}</td>
                      <td className="border-b border-slate-800/60 py-1 text-slate-300">{t.static_decision}</td>
                      <td className={`border-b border-slate-800/60 py-1 font-bold ${t.decisions_differ ? "text-emerald-300" : "text-rose-300"}`}>
                        {t.decisions_differ ? "Yes" : "No"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border border-line bg-black/20 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">Archetype ordering experiment (3 trials)</div>
              <div className="mt-1 font-mono text-xl font-black text-cyan-200">
                {Math.round(data.archetype_ordering_experiment.pass_rate * 100)}% pass
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Expected order: {data.archetype_ordering_experiment.expected_order.join(" > ")}
              </div>
              <table className="mt-2 w-full border-collapse text-[11px]">
                <thead>
                  <tr>
                    {["Scale", "Actual order", "Match?"].map((h) => (
                      <th className="border-b border-line pb-1 text-left uppercase text-slate-500" key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.archetype_ordering_experiment.trials.map((t) => (
                    <tr key={t.position_scale}>
                      <td className="border-b border-slate-800/60 py-1 font-mono text-slate-300">{t.position_scale}&times;</td>
                      <td className="border-b border-slate-800/60 py-1 text-slate-400">{t.actual_order.join(" > ")}</td>
                      <td className={`border-b border-slate-800/60 py-1 font-bold ${t.matches_expected_order ? "text-emerald-300" : "text-rose-300"}`}>
                        {t.matches_expected_order ? "Yes" : "No"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {data.live_computational_benefit?.frames_measured > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              This run also folds in {data.live_computational_benefit.frames_measured} real
              processed frames from this session&apos;s own D2 accumulator.
            </p>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">{data.note}</p>
        </>
      )}
    </div>
  );
}

export default function Comparison({ isLive }) {
  return (
    <section className="grid gap-4">
      <MappingComparisonShowcase />

      <div className="panel">
        <div className="section-title">A3 · Baseline Benchmark Mode (measured, not illustrative)</div>
        <LiveBaselineComparison isLive={isLive} />
      </div>

      <div className="panel">
        <div className="section-title">D1 · Same-Distance, Different-Resolution Probe</div>
        <SameDistanceProbe isLive={isLive} />
      </div>

      <div className="panel">
        <div className="section-title">D2 · Measured Computational Benefit (running experiment)</div>
        <MeasuredComputationalBenefit isLive={isLive} />
      </div>

      <div className="panel">
        <div className="section-title">D5 · Why 2.5D</div>
        <Why25DPanel isLive={isLive} />
      </div>

      <div className="panel">
        <div className="section-title">D7 · Region-by-Region Decision Explanation</div>
        <RegionDecisionExplanationPanel isLive={isLive} />
      </div>

      <div className="panel">
        <div className="section-title">D8 · Judge-Ready Controlled Experiment</div>
        <ControlledExperimentPanel isLive={isLive} />
      </div>
    </section>
  );
}