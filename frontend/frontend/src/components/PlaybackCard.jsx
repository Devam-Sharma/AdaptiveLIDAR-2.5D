import { Pause, Play, RotateCcw, SkipForward, Zap } from "lucide-react";

export default function PlaybackCard({ controls, onReset, onStep, setControls }) {
  return (
    <section className="glow-blue-border rounded-xl border border-blue-500/30 bg-[#0c1024]/80 p-4 shadow-lg backdrop-blur-md" data-purpose="playback-card">
      <div className="mb-3 flex items-center space-x-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
        <Zap className="text-blue-400" size={13} />
        <span>Playback</span>
      </div>

      <div className="mb-3.5 grid grid-cols-3 gap-2">
        <button
          className="col-span-1 flex items-center justify-center space-x-1.5 rounded-lg bg-blue-600 px-2.5 py-2 text-xs font-semibold text-white shadow-md shadow-blue-600/40 transition hover:bg-blue-500 active:scale-95"
          onClick={() => setControls((current) => ({ ...current, running: !current.running }))}
          title="Play or pause the frame stream"
          type="button"
        >
          {controls.running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}
          <span>{controls.running ? "Pause" : "Play"}</span>
        </button>
        <button
          className="flex items-center justify-center space-x-1 rounded-lg border border-slate-700 bg-slate-800/90 px-2.5 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-700/80 active:scale-95"
          onClick={onStep}
          title="Advance exactly one frame"
          type="button"
        >
          <SkipForward className="h-3.5 w-3.5" />
          <span>Step</span>
        </button>
        <button
          className="flex items-center justify-center space-x-1 rounded-lg border border-slate-700 bg-slate-800/90 px-2.5 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-700/80 active:scale-95"
          onClick={onReset}
          title="Reset playback"
          type="button"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Reset</span>
        </button>
      </div>

      <label className="flex cursor-pointer select-none items-center space-x-2.5 text-xs text-slate-300">
        <input
          checked={controls.showPrediction}
          className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-0 focus:ring-offset-0"
          onChange={(e) => setControls((current) => ({ ...current, showPrediction: e.target.checked }))}
          type="checkbox"
        />
        <span className="text-[12.5px]">Show predicted future positions</span>
      </label>
    </section>
  );
}