import { useState } from "react";
import { Zap } from "lucide-react";
import { setDatasetPath, updateConfig } from "../api/backendClient.js";

export default function BackendConfigCard({ dataSource }) {
  const [pathInput, setPathInput] = useState("");
  const [budgetInput, setBudgetInput] = useState("5000");
  const [note, setNote] = useState("");
  const disabled = dataSource !== "live";

  const applyPath = async () => {
    if (!pathInput.trim()) return;
    try {
      await setDatasetPath(pathInput.trim());
      setNote("Dataset path set.");
    } catch (err) {
      setNote(`Failed: ${err.message}`);
    }
  };

  const applyBudget = async () => {
    const value = Number(budgetInput);
    if (!Number.isFinite(value) || value <= 0) return;
    try {
      await updateConfig({ computational_budget: value });
      setNote(`Budget set to ${value}.`);
    } catch (err) {
      setNote(`Failed: ${err.message}`);
    }
  };

  return (
    <section className="flex flex-1 flex-col justify-between rounded-xl border border-indigo-900/60 bg-[#0c1024]/80 p-4 shadow-lg" data-purpose="backend-setup-card">
      <div>
        <div className="mb-3">
          <div className="flex items-center space-x-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300">
            <Zap className="text-cyan-400" size={13} />
            <span>Backend setup</span>
          </div>
          <p className="mt-0.5 font-mono text-[10px] text-slate-400">Same calls as POST /api/dataset/path &amp; /api/config</p>
        </div>
        <div className="space-y-2 font-mono">
          <div className="flex space-x-1.5">
            <input
              className="flex-1 rounded-lg border border-slate-800 bg-slate-950/80 px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none disabled:opacity-40"
              disabled={disabled}
              onChange={(e) => setPathInput(e.target.value)}
              placeholder="Dataset path"
              type="text"
              value={pathInput}
            />
            <button
              className="rounded-lg bg-blue-600/90 px-3 py-1.5 font-sans text-xs font-medium text-white transition hover:bg-blue-600 disabled:opacity-40"
              disabled={disabled}
              onClick={applyPath}
              type="button"
            >
              Set
            </button>
          </div>
          <div className="flex space-x-1.5">
            <input
              className="flex-1 rounded-lg border border-slate-800 bg-slate-950/80 px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none disabled:opacity-40"
              disabled={disabled}
              onChange={(e) => setBudgetInput(e.target.value)}
              type="text"
              value={budgetInput}
            />
            <button
              className="rounded-lg bg-blue-600/90 px-3 py-1.5 font-sans text-xs font-medium text-white transition hover:bg-blue-600 disabled:opacity-40"
              disabled={disabled}
              onClick={applyBudget}
              type="button"
            >
              Set
            </button>
          </div>
        </div>
        {note && <p className="mt-2 text-[11px] text-slate-400">{note}</p>}
      </div>
      <div className="mt-3 border-t border-slate-800/80 pt-3">
        <p className="text-[11px] italic text-slate-400">
          {disabled ? "Switch to Live Backend to apply these." : "Applies immediately to the running backend."}
        </p>
      </div>
    </section>
  );
}