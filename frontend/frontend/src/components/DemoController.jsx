import { motion, AnimatePresence } from "framer-motion";
import { PlayCircle, Square } from "lucide-react";
import { DEMO_STEPS } from "../data/simulationData.js";

export default function DemoController({ controls, setControls }) {
  return (
    <>
      <button
        className={`control-button ${controls.demoActive ? "control-button-active" : ""}`}
        onClick={() =>
          setControls((current) => ({
            ...current,
            demoActive: !current.demoActive,
            running: true,
            showPrediction: true,
            demoStep: current.demoActive ? current.demoStep : 0,
          }))
        }
        title="Run a timed walkthrough of adaptive information budgeting"
        type="button"
      >
        {controls.demoActive ? <Square size={16} /> : <PlayCircle size={16} />}
        <span className="ml-2">{controls.demoActive ? "Stop Demo" : "Run Demo"}</span>
      </button>

      <AnimatePresence>
        {controls.demoActive && (
          <motion.aside
            animate={{ opacity: 1, y: 0 }}
            className="fixed bottom-6 right-6 z-30 w-[360px] rounded-lg border border-cyanSignal/60 bg-slate-950/95 p-4 shadow-glow backdrop-blur-xl"
            exit={{ opacity: 0, y: 16 }}
            initial={{ opacity: 0, y: 16 }}
          >
            <div className="flex items-center justify-between">
              <strong className="text-sm font-black uppercase tracking-[0.16em] text-cyan-100">Run Demo</strong>
              <span className="text-xs font-bold text-slate-500">Step {controls.demoStep + 1}/{DEMO_STEPS.length}</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-300">{DEMO_STEPS[controls.demoStep]}</p>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
