import { AlertTriangle, Loader2, PlugZap, RefreshCw } from "lucide-react";

// Explicit state for "Live Backend is selected but there is no live data".
//
// This replaces a silent fallback: the app used to quietly render simulated
// regions whenever the live response was empty, while the "Live Backend" button
// stayed highlighted. On stage that means a dead backend, a wrong dataset path
// and a perfectly healthy system all look identical -- the worst possible
// failure mode for a demo. Now the reason is on screen, with a one-click
// recovery to the simulation.

const COPY = {
  connecting: {
    Icon: Loader2,
    spin: true,
    tone: "text-amber-300",
    ring: "border-amber-400/30 bg-amber-400/5",
    title: "Connecting to the live backend",
    body: "Requesting the first processed frame from http://localhost:8000.",
    hint: null,
  },
  empty: {
    Icon: PlugZap,
    spin: false,
    tone: "text-amber-300",
    ring: "border-amber-400/30 bg-amber-400/5",
    title: "Backend is responding, but returned no regions",
    body: "The frame was processed successfully and contained zero active map cells.",
    hint: "Usually the dataset path is unset or points at frames with no returns inside the map extent. POST /api/dataset/path with the velodyne directory, then retry.",
  },
  error: {
    Icon: AlertTriangle,
    spin: false,
    tone: "text-rose-400",
    ring: "border-rose-500/30 bg-rose-500/5",
    title: "Live backend unreachable",
    body: "The request to /api/frame failed.",
    hint: "Start it with `python app.py` in the backend directory, then POST /api/dataset/path and POST /api/config {\"computational_budget\": 5000} before retrying.",
  },
  idle: {
    Icon: PlugZap,
    spin: false,
    tone: "text-slate-400",
    ring: "border-line bg-slate-950/60",
    title: "Live backend not started",
    body: "No frames have been requested yet.",
    hint: null,
  },
};

export default function LiveStatusPanel({ error, onRetry, onUseSimulated, status = "connecting" }) {
  const { Icon, spin, tone, ring, title, body, hint } = COPY[status] ?? COPY.connecting;

  return (
    <div className={`panel flex flex-col items-start gap-4 border ${ring}`}>
      <div className="flex items-center gap-3">
        <Icon className={`${tone} ${spin ? "animate-spin" : ""}`} size={22} />
        <div>
          <h2 className="text-lg font-black text-slate-100">{title}</h2>
          <p className="text-sm text-slate-400">{body}</p>
        </div>
      </div>

      {hint && <p className="max-w-2xl text-xs leading-relaxed text-slate-500">{hint}</p>}

      {error && (
        <pre className="max-w-full overflow-x-auto rounded-md border border-line bg-slate-950 p-3 text-xs text-rose-300">
          {error}
        </pre>
      )}

      <div className="flex gap-2">
        <button className="control-button" onClick={onRetry} type="button">
          <RefreshCw className="mr-1 inline" size={13} />
          Retry live backend
        </button>
        <button className="control-button control-button-active" onClick={onUseSimulated} type="button">
          Switch to Simulated Demo
        </button>
      </div>

      <p className="text-xs text-slate-500">
        Simulated Demo is fully self-contained and needs no backend — use it if the live path is unavailable.
      </p>
    </div>
  );
}