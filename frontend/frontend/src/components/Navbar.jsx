import { Activity, Cpu, Gauge, RadioTower } from "lucide-react";
import { NAV_ITEMS } from "../data/simulationData.js";

// Mirrors the status states LiveStatusPanel and the top-bar pill already use,
// so the navbar can't say something different from the rest of the page.
// Previously this badge was hardcoded to a green "System Online" regardless
// of dataSource/liveStatus, and fps/computeUsage fell back to the simulated
// sine-wave numbers whenever the live poll had no data (connecting, error,
// or empty) -- so a genuinely unreachable backend still showed a healthy
// green "System Online · 55 FPS · 94% Compute" in the header, while the
// panel below it correctly said "Live backend unreachable". On stage the
// header is the thing people glance at, so it has to agree with reality.
const STATUS_COPY = {
  simulated: { label: "Simulated Demo", dotClass: "bg-sky-400 shadow-[0_0_14px_rgba(56,189,248,0.85)]", textClass: "text-sky-300" },
  live: { label: "System Online", dotClass: "bg-stable shadow-[0_0_14px_rgba(34,197,94,0.85)]", textClass: "text-emerald-300" },
  connecting: { label: "Connecting…", dotClass: "bg-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.85)]", textClass: "text-amber-300" },
  empty: { label: "No Regions", dotClass: "bg-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.85)]", textClass: "text-amber-300" },
  error: { label: "Backend Unreachable", dotClass: "bg-rose-500 shadow-[0_0_14px_rgba(244,63,94,0.85)]", textClass: "text-rose-400" },
};

export default function Navbar({ activePage, computeUsage, fps, frameNumber, datasetTotalFrames, onNavigate, dataSource = "simulated", liveStatus = "idle" }) {
  // dataSource=simulated ignores liveStatus entirely (it's leftover state
  // from a previous Live session); dataSource=live maps liveStatus's
  // "idle" (not yet polled) onto the same "connecting" copy.
  const statusKey = dataSource === "simulated" ? "simulated" : liveStatus === "idle" ? "connecting" : liveStatus;
  const { label, dotClass, textClass } = STATUS_COPY[statusKey] ?? STATUS_COPY.connecting;
  // Only trust fps/computeUsage as real system stats when actually live;
  // otherwise they're the simulation's invented numbers and showing them
  // next to "Backend Unreachable" would still look like telemetry.
  const showMetrics = statusKey === "live" || statusKey === "simulated";

  return (
    <header className="grid gap-4 rounded-lg border border-line bg-black/45 px-4 py-3 shadow-panel backdrop-blur-xl xl:grid-cols-[1fr_auto_1fr] xl:items-center">
      <div>
        <h1 className="text-xl font-black tracking-wide text-slate-50">Predictive Adaptive 2.5D Mapping</h1>
        <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Adaptive Information Budgeting Engine</p>
      </div>

      <nav className="flex flex-wrap gap-2">
        {NAV_ITEMS.map((item) => (
          <button
            className={`control-button ${activePage === item.id ? "control-button-active" : ""}`}
            key={item.id}
            onClick={() => onNavigate(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-300 xl:justify-end">
        <span className={`flex items-center gap-2 ${textClass}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
          {label}
        </span>
        {showMetrics ? (
          <>
            <span className="flex items-center gap-1"><Gauge size={14} /> {fps} FPS</span>
            <span className="flex items-center gap-1" title={dataSource === "live" ? "Position in the loaded dataset (loops back to 0 after the last frame)." : "Simulated frame counter (runs indefinitely, not tied to a fixed dataset)."}>
              <RadioTower size={14} />
              Frame {dataSource === "live" && datasetTotalFrames ? `${frameNumber} / ${datasetTotalFrames}` : frameNumber}
            </span>
            <span className="flex items-center gap-1"><Cpu size={14} /> {computeUsage}% Compute</span>
            <span className="flex items-center gap-1"><Activity size={14} /> {dataSource === "live" ? "Live" : "Simulated"}</span>
          </>
        ) : (
          <span className="flex items-center gap-1 text-slate-500"><RadioTower size={14} /> No telemetry</span>
        )}
      </div>
    </header>
  );
}