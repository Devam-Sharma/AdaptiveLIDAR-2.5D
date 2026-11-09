import { useState } from "react";
import { FastForward, Pause, Play, RotateCcw, ServerCog } from "lucide-react";
import { setDatasetPath, updateConfig } from "../api/backendClient.js";

const TIERS = [
  { decision: "COARSEN", label: "COARSE", barClass: "bg-slate-500", glowClass: "" },
  { decision: "MAINTAIN", label: "MEDIUM", barClass: "bg-emerald-400", glowClass: "glow-emerald-bar" },
  { decision: "REFINE", label: "FINE", barClass: "bg-cyanSignal", glowClass: "glow-cyan-bar" },
];

function ResolutionTiers({ regions }) {
  const tierStats = TIERS.map((tier) => {
    const inTier = regions.filter((r) => r.decision === tier.decision);
    const avgUtility = inTier.length
      ? inTier.reduce((sum, r) => sum + r.utility, 0) / inTier.length
      : 0;
    return { ...tier, count: inTier.length, avgUtility };
  });
  const maxUtility = Math.max(...tierStats.map((t) => t.avgUtility), 0.01);

  return (
    <div className="glass-panel">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="section-title mb-0">Resolution Tiers</h2>
        <span className="font-mono text-[11px] text-slate-500">AVG UTILITY</span>
      </div>
      <div className="space-y-4 font-mono">
        {tierStats.map((tier) => (
          <div key={tier.decision}>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-semibold tracking-wider text-slate-300">
                {tier.label} <span className="text-slate-600">{"\u00b7"} {tier.count}</span>
              </span>
              <span className="text-slate-300">{tier.avgUtility.toFixed(2)}</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full border border-slate-800 bg-slate-900/90 p-0.5">
              <div
                className={`h-full rounded-full ${tier.barClass} ${tier.glowClass}`}
                style={{ width: `${Math.round((tier.avgUtility / maxUtility) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlaybackControls({ controls, setControls, resetSimulation }) {
  return (
    <div className="glass-panel">
      <h2 className="section-title mb-4 justify-between">
        <span>Playback</span>
      </h2>
      <div className="flex items-center space-x-4 py-1">
        <button
          aria-label={controls.running ? "Pause" : "Play"}
          className="glow-cyan-btn flex h-14 w-14 items-center justify-center rounded-full border border-cyanSignal bg-cyanSignal/10 text-cyanSignal transition-transform hover:bg-cyanSignal/20 active:scale-95"
          onClick={() => setControls((c) => ({ ...c, running: !c.running }))}
          type="button"
        >
          {controls.running ? <Pause size={22} /> : <Play className="translate-x-0.5" size={22} />}
        </button>
        <button
          aria-label="Toggle 2x speed"
          aria-pressed={controls.speed > 1}
          className={`glow-cyan-btn flex h-12 w-12 items-center justify-center rounded-full border transition-transform active:scale-95 ${
            controls.speed > 1
              ? "border-cyanSignal bg-cyanSignal/15 text-cyanSignal"
              : "border-cyan-500/50 bg-[#0d1c2d] text-cyanSignal/80 hover:border-cyanSignal"
          }`}
          onClick={() => setControls((c) => ({ ...c, speed: c.speed > 1 ? 1 : 2 }))}
          type="button"
        >
          <FastForward size={18} />
        </button>
        <button
          aria-label="Reset"
          className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-700 bg-[#0e1624] text-slate-400 transition-all hover:border-risk hover:text-risk active:scale-95"
          onClick={resetSimulation}
          type="button"
        >
          <RotateCcw size={18} />
        </button>
        <span className="font-mono text-xs text-slate-500">{controls.speed}x</span>
      </div>
      <div className="mt-5 border-t border-line pt-4">
        <label className="flex cursor-pointer select-none items-center space-x-2.5 text-xs text-slate-300 transition-colors hover:text-white">
          <input
            checked={controls.showPrediction}
            className="h-4 w-4 cursor-pointer rounded border-slate-700 bg-slate-900 text-cyanSignal focus:ring-0 focus:ring-offset-0"
            onChange={(e) => setControls((c) => ({ ...c, showPrediction: e.target.checked }))}
            type="checkbox"
          />
          <span>Show predicted future positions</span>
        </label>
      </div>
    </div>
  );
}

// Only meaningful in Live mode -- there is no backend process to configure
// while running the client-side simulation, so the fields are disabled
// (rather than silently doing nothing) when dataSource isn't "live".
function BackendConfiguration({ dataSource }) {
  const isLive = dataSource === "live";
  const [path, setPath] = useState("");
  const [budget, setBudget] = useState("");
  const [refineThreshold, setRefineThreshold] = useState("");
  const [status, setStatus] = useState(null);

  const run = async (label, fn) => {
    setStatus(`Setting ${label}\u2026`);
    try {
      await fn();
      setStatus(`${label} updated.`);
    } catch (err) {
      setStatus(`${label} failed: ${err.message}`);
    }
  };

  return (
    <div className="glass-panel">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="section-title mb-0">
          <ServerCog size={15} />
          Backend Configuration
        </h2>
      </div>
      <div className="space-y-3 font-mono text-xs">
        <ConfigRow
          disabled={!isLive}
          label="Dataset path"
          onSet={() => path && run("Dataset path", () => setDatasetPath(path))}
          placeholder="/data/sequences/00"
          setValue={setPath}
          value={path}
        />
        <ConfigRow
          disabled={!isLive}
          label="Comp. budget"
          onSet={() => budget && run("Budget", () => updateConfig({ computational_budget: Number(budget) }))}
          placeholder="5000"
          setValue={setBudget}
          value={budget}
        />
        <ConfigRow
          disabled={!isLive}
          label="Refine thresh."
          onSet={() => refineThreshold && run("Refine threshold", () => updateConfig({ refine_threshold: Number(refineThreshold) }))}
          placeholder="0.55"
          setValue={setRefineThreshold}
          value={refineThreshold}
        />
      </div>
      <p className="mt-3 text-[11px] text-slate-500">
        {isLive ? (status ?? "Applies to the running backend immediately.") : "Switch to Live Backend to edit these."}
      </p>
    </div>
  );
}

function ConfigRow({ disabled, label, onSet, placeholder, setValue, value }) {
  return (
    <div className="flex items-center justify-between space-x-2">
      <span className="w-24 shrink-0 text-slate-400">{label}</span>
      <input
        className="w-24 rounded-lg border border-slate-700/80 bg-slate-900/90 px-2.5 py-1.5 text-center text-xs text-slate-200 focus:border-cyanSignal focus:outline-none disabled:opacity-40"
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        type="text"
        value={value}
      />
      <button
        className="glow-cyan-btn rounded-lg border border-cyanSignal/60 bg-cyanSignal/10 px-3.5 py-1.5 font-semibold tracking-wider text-cyanSignal hover:bg-cyanSignal/25 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={disabled}
        onClick={onSet}
        type="button"
      >
        Set
      </button>
    </div>
  );
}

export default function LeftControlPanel({ controls, dataSource, regions, resetSimulation, setControls }) {
  return (
    <aside className="flex flex-col gap-4 lg:col-span-3">
      <PlaybackControls controls={controls} resetSimulation={resetSimulation} setControls={setControls} />
      <ResolutionTiers regions={regions} />
      <BackendConfiguration dataSource={dataSource} />
    </aside>
  );
}