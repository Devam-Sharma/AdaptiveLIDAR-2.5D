import { Radar as RadarIcon } from "lucide-react";

// Mirrors the same status vocabulary Navbar uses (idle/connecting/live/empty/error)
// so this page's header can never disagree with the rest of the app about
// whether the backend is actually reachable.
const STATUS_COPY = {
  simulated: { label: "Simulated Demo", dot: "bg-emerald-400", border: "border-emerald-500/50", bg: "bg-emerald-950/30", text: "text-emerald-400", glow: "glow-green-pill" },
  live: { label: "Live Backend Active", dot: "bg-emerald-400", border: "border-emerald-500/50", bg: "bg-emerald-950/30", text: "text-emerald-400", glow: "glow-green-pill" },
  connecting: { label: "Connecting\u2026", dot: "bg-amber-400", border: "border-amber-500/50", bg: "bg-amber-950/20", text: "text-amber-300", glow: "" },
  empty: { label: "No Regions", dot: "bg-amber-400", border: "border-amber-500/50", bg: "bg-amber-950/20", text: "text-amber-300", glow: "" },
  error: { label: "Backend Unreachable", dot: "bg-risk", border: "border-red-500/50", bg: "bg-red-950/20", text: "text-red-400", glow: "" },
};

export default function DashboardHeader({ budgetPercent, dataSource, frameNumber, liveStatus, setDataSource }) {
  const statusKey = dataSource === "simulated" ? "simulated" : liveStatus === "idle" ? "connecting" : liveStatus;
  const status = STATUS_COPY[statusKey] ?? STATUS_COPY.connecting;

  return (
    <header className="glass-panel mb-4 flex flex-wrap items-center justify-between gap-4 !rounded-2xl px-6 py-3">
      <div className="flex items-center space-x-3.5">
        <div className="glow-cyan flex h-10 w-10 items-center justify-center rounded-xl border border-cyanSignal/40 bg-obsidian p-2">
          <RadarIcon className="text-cyanSignal" size={22} strokeWidth={1.8} />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xl font-bold tracking-tight text-white">FoveaMap</span>
            <span className="rounded border border-cyanSignal/30 bg-cyanSignal/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-cyanSignal">
              LiDAR
            </span>
          </div>
          <p className="font-mono text-xs tracking-wide text-slate-400">Adaptive 2.5D LiDAR mapping</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 font-mono text-xs font-medium">
        <div className={`flex items-center space-x-2 rounded-full border px-4 py-1.5 ${status.border} ${status.bg} ${status.text} ${status.glow}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${status.dot} ${statusKey === "live" || statusKey === "simulated" ? "animate-pulse" : ""}`} />
          <span className="font-bold tracking-wider">{status.label.toUpperCase()}</span>
        </div>
        <div className="flex items-center space-x-2 rounded-full border border-line bg-[#0f1826] px-4 py-1.5 text-slate-300">
          <span className="text-slate-400">FRAME</span>
          <span className="font-bold tracking-wider text-white">{frameNumber}</span>
        </div>
        <div className="glow-cyan flex items-center space-x-2 rounded-full border border-cyanSignal/60 bg-cyan-950/30 px-4 py-1.5 text-cyanSignal">
          <span className="text-cyanSignal/80">BUDGET</span>
          <span className="font-bold tracking-wider text-white">{budgetPercent}%</span>
        </div>
      </div>

      <div className="flex items-center space-x-3 text-xs">
        <span className={dataSource === "simulated" ? "font-medium text-slate-300" : "text-slate-500"}>Simulated Demo</span>
        <button
          aria-checked={dataSource === "live"}
          aria-label="Toggle between Simulated Demo and Live Backend"
          className="relative inline-flex h-6 w-12 cursor-pointer items-center rounded-full border border-slate-700 bg-slate-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyanSignal"
          onClick={() => setDataSource(dataSource === "live" ? "simulated" : "live")}
          role="switch"
          type="button"
        >
          <span
            className={`h-5 w-5 rounded-full border border-slate-300 bg-cyanSignal transition-transform ${dataSource === "live" ? "translate-x-6" : "translate-x-0.5"}`}
          />
        </button>
        <span className={dataSource === "live" ? "font-medium text-slate-300" : "text-slate-500"}>Live Backend</span>
      </div>
    </header>
  );
}
