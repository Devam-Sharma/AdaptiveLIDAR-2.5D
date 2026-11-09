import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Bike,
  Car,
  CarFront,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cpu,
  Crosshair,
  Gauge,
  GitBranch,
  Layers3,
  Pause,
  PersonStanding,
  Play,
  Route,
  RotateCcw,
  ScanLine,
  Settings2,
  ShieldCheck,
  SkipForward,
  Target,
  TrendingUp,
} from "lucide-react";
import { getState, getPredictionTiming } from "../api/backendClient.js";
import { AnimalTop, BarrierTop, BuildingTop, CarTop, TreeTop } from "../components/SceneModels.jsx";
import { simPredictionError, simFutureCandidates, simPredictionTiming } from "../utils/simulatedDemo.js";

// Five pipeline stages (was nine) -- matches the autonomous feedback loop as
// it's actually explained to viewers: perceive -> predict -> prioritize ->
// adapt resolution -> safe corridors. The richer nine-beat story below still
// drives the scene (obstacle emerging, getting detected, etc.) but every one
// of those beats now maps onto ONE of these five stages instead of getting
// its own box, so the pipeline reads as a loop instead of a checklist.
const STAGES = [
  { key: "PERCEIVE", label: "Objects detected" },
  { key: "PREDICT", label: "Future motion" },
  { key: "PRIORITIZE", label: "Compute utility" },
  { key: "ADAPT RESOLUTION", label: "Refine critical regions" },
  { key: "SAFE CORRIDORS", label: "Path updated" },
];

// phase (0-8, from SCENES below) -> which of the 5 STAGES is current.
const STAGE_FOR_PHASE = [0, 0, 0, 1, 1, 2, 3, 3, 4];

const SCENES = [
  { phase: 0, title: "Clear road", detail: "Low information value ahead → keep most of the map coarse.", obstacle: false, predicted: false, refine: false },
  { phase: 1, title: "Animal enters view", detail: "An animal moves into the vehicle's sensor field ahead.", obstacle: true, obstacleX: 55, predicted: false, refine: false },
  { phase: 2, title: "Object detected", detail: "Semantic perception classifies the object as a dynamic animal actor.", obstacle: true, obstacleX: 53, predicted: false, refine: false },
  { phase: 3, title: "Motion / trajectory evaluated", detail: "The system checks whether the animal's path intersects the projected corridor.", obstacle: true, obstacleX: 51, predicted: true, refine: false },
  { phase: 4, title: "Future collision risk", detail: "Predicted occupancy overlaps the current driving corridor.", obstacle: true, obstacleX: 49, predicted: true, refine: true },
  { phase: 5, title: "Utility crosses threshold", detail: "Expected information gain is now worth the extra computation.", obstacle: true, obstacleX: 47, predicted: true, refine: true },
  { phase: 6, title: "Fovea refinement", detail: "Only the critical animal / future corridor receives 5 cm cells.", obstacle: true, obstacleX: 45, predicted: true, refine: true },
  { phase: 7, title: "Budget reallocation", detail: "Low-value cells are coarsened and their budget is reclaimed.", obstacle: true, obstacleX: 43, predicted: true, refine: true },
  { phase: 8, title: "Safe corridor selected", detail: "The original path is blocked, so the predicted free corridor is updated.", obstacle: true, obstacleX: 41, predicted: true, refine: true },
];

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function scenarioAt(time, demoStep, running) {
  const continuous = running ? time * 0.72 : time * 0.72;
  const phase = demoStep % SCENES.length;
  const scene = SCENES[phase];
  const vehicleY = 82 - ((continuous * 7) % 10);
  const obstacleX = scene.obstacleX ?? 50;
  const obstacleY = clamp(34 - Math.max(0, phase - 1) * 1.8, 20, 34);
  const speed = phase < 4 ? 8.0 + Math.sin(time) * 0.4 : 6.8 + Math.sin(time) * 0.25;
  const utility = [0.82, 1.02, 1.24, 1.58, 1.94, 2.28, 2.62, 2.38, 2.12][phase];
  const confidence = [0.94, 0.91, 0.93, 0.9, 0.88, 0.92, 0.94, 0.95, 0.96][phase];
  const infoGain = [0.18, 0.25, 0.34, 0.47, 0.62, 0.71, 0.78, 0.69, 0.63][phase];
  const cost = [0.22, 0.24, 0.25, 0.27, 0.29, 0.31, 0.3, 0.29, 0.3][phase];
  const decision = scene.refine ? "REFINE" : phase >= 2 ? "MAINTAIN" : "COARSEN";
  const cells = scene.refine ? 3120 : phase >= 2 ? 840 : 180;

  // The moving vehicle ahead is a SEPARATE, always-present dynamic actor
  // (distinct from the animal hazard above) -- it's the one the
  // Object Information panel focuses on, same as a real perception stack
  // would keep tracking a moving car even while another dynamic hazard is also
  // being evaluated.
  const vehicleSpeedMps = 8.2 + Math.sin(time * 0.9) * 0.3;
  const vehicleDistance = clamp(24 - ((continuous * 1.6) % 14), 6, 24);
  const vehiclePredictedDisplacement = vehicleSpeedMps * 1.5;
  const vehicleConfidence = clamp(0.88 + Math.sin(time * 0.5) * 0.04, 0.85, 0.97);

  return {
    phase, scene, vehicleY, obstacleX, obstacleY, speed, utility, confidence, infoGain, cost, decision, cells,
    vehicleSpeedMps, vehicleDistance, vehiclePredictedDisplacement, vehicleConfidence,
    refine: scene.refine,
  };
}

function Pipeline({ active }) {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border border-line bg-black/20 p-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-1.5">
        {STAGES.map((stage, i) => {
          const done = i <= active;
          return (
            <div className="flex items-center gap-1.5" key={stage.key}>
              <div className={`rounded-md border px-2.5 py-1.5 ${done ? "border-cyanSignal/60 bg-cyanSignal/10" : "border-line bg-black/20"}`}>
                <div className={`text-[10px] font-black tracking-[0.1em] ${done ? "text-cyanSignal" : "text-slate-600"}`}>{i + 1}. {stage.key}</div>
                <div className={`mt-0.5 text-[10px] leading-tight ${done ? "text-slate-300" : "text-slate-600"}`}>{done ? "✓ " : ""}{stage.label}</div>
              </div>
              {i < STAGES.length - 1 && <ChevronRight className={done ? "text-cyanSignal/60" : "text-slate-700"} size={14} />}
            </div>
          );
        })}
      </div>
      <span className="flex shrink-0 items-center gap-2 self-start rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-300 lg:self-auto">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
        Autonomous feedback matrix · Active
      </span>
    </div>
  );
}

function vehicleY(sim) {
  return 82 - ((sim.phase * 3) % 10);
}

function clampU(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

// Real per-object utility factors, computed live from sim state (not
// hardcoded), using the SAME weighted formula and REFINE/MAINTAIN/COARSEN
// thresholds as utils/utilityCalculation.js -- so every object's decision is
// derived the same way the ego reasons about anything it looks at.
function factorsFor(id, sim) {
  const vehicleActive = sim.phase >= 3;
  switch (id) {
    case "vehicle":
      return {
        safetyRelevance: clampU(0.5 + (1 - sim.vehicleDistance / 24) * 0.45, 0.3, 0.97),
        motion: clampU(sim.vehicleSpeedMps / 10, 0, 1),
        uncertainty: clampU(1 - sim.vehicleConfidence, 0.03, 0.6),
        geometricComplexity: 0.46,
        distanceValue: clampU(1 - sim.vehicleDistance / 30, 0.08, 1),
        futureOccupancy: sim.scene.predicted ? clampU(0.3 + (1 - sim.vehicleDistance / 24) * 0.5, 0.1, 0.9) : 0.1,
        baseCost: 0.38,
        dynamic: true,
      };
    case "parkedCar":
      return { safetyRelevance: 0.25, motion: 0, uncertainty: 0.12, geometricComplexity: 0.3, distanceValue: 0.4, futureOccupancy: 0.05, baseCost: 0.22, dynamic: false };
    case "building":
      return { safetyRelevance: 0.15, motion: 0, uncertainty: 0.08, geometricComplexity: 0.5, distanceValue: 0.25, futureOccupancy: 0.02, baseCost: 0.2, dynamic: false };
    case "animal":
      return {
        safetyRelevance: sim.phase >= 4 ? 0.95 : 0.52,
        motion: sim.phase >= 3 ? 0.88 : 0.18,
        uncertainty: sim.phase >= 2 ? 0.42 : 0.16,
        geometricComplexity: 0.36,
        distanceValue: clampU(1 - sim.obstacleY / 40, 0.08, 1),
        futureOccupancy: sim.scene.predicted ? 0.79 : 0.12,
        baseCost: 0.3,
        // An animal darting across the road is a moving actor by definition --
        // unlike a real road barrier, it has no business being "static".
        dynamic: true,
      };
    // The ego's own reference profile -- not a tracked object, just the
    // "nothing to worry about" baseline every other object is measured
    // against, so the UI can say WHY something outranks the ego's own idle state.
    case "ego":
      return { safetyRelevance: 0.2, motion: 0.1, uncertainty: 0.05, geometricComplexity: 0.2, distanceValue: 0.1, futureOccupancy: 0.05, baseCost: 0.15, dynamic: false };
    default:
      return null;
  }
}

function utilityFor(factors) {
  const ig = clampU(
    factors.safetyRelevance * 0.27 +
      factors.motion * 0.18 +
      factors.uncertainty * 0.2 +
      factors.geometricComplexity * 0.15 +
      factors.distanceValue * 0.08 +
      factors.futureOccupancy * 0.12,
    0.04,
    0.98,
  );
  const cost = clampU(factors.baseCost + ig * 0.11 + (factors.dynamic ? 0.08 : 0), 0.1, 0.82);
  const utility = ig / cost;
  const decision = utility > 1.8 ? "REFINE" : utility > 1.08 ? "MAINTAIN" : "COARSEN";
  return { ig, cost, utility, decision };
}

// Static per-object facts + live-computed utility. rows are the metrics the
// Object Information card displays; factors/ig/cost/utility/decision feed
// the Information Utility Engine's per-object comparison against the ego.
function objectInfoFor(id, sim) {
  const factors = factorsFor(id, sim);
  if (!factors) return null;
  const { ig, cost, utility, decision } = utilityFor(factors);
  const base = { factors, ig, cost, utility, decision };
  switch (id) {
    case "vehicle":
      return {
        ...base, name: "Moving Vehicle #1", badge: "DYNAMIC",
        rows: [
          ["Distance", `${sim.vehicleDistance.toFixed(1)} m`],
          ["Velocity", `${sim.vehicleSpeedMps.toFixed(1)} m/s`],
          ["Predicted Position", `+${sim.vehiclePredictedDisplacement.toFixed(1)} m (1.5s)`],
          ["Confidence", `${Math.round(sim.vehicleConfidence * 100)}%`],
        ],
      };
    case "parkedCar":
      return { ...base, name: "Parked Car", badge: "STATIC", rows: [["Distance", "18.4 m"], ["Velocity", "0.0 m/s"], ["Occupancy", "84%"], ["Confidence", "97%"]] };
    case "building":
      return { ...base, name: "Building Facade", badge: "STATIC", rows: [["Distance", "31.2 m"], ["Velocity", "0.0 m/s"], ["Occupancy", "96%"], ["Confidence", "93%"]] };
    case "animal":
      return {
        ...base, name: "Animal", badge: "DYNAMIC · HAZARD",
        rows: [
          ["Distance", `${(sim.obstacleY * 0.6).toFixed(1)} m`],
          ["Velocity", `${(factors.motion * 3).toFixed(1)} m/s`],
          ["Predicted overlap", sim.scene.predicted ? "Yes" : "No"],
          ["Confidence", `${Math.round(sim.confidence * 100)}%`],
        ],
      };
    // The ego's own baseline row isn't shown in the Object panel (it's
    // never "selected" from the scene), but UtilityPanel needs a full
    // objectInfoFor("ego", sim) result to build its comparison box.
    case "ego":
      return {
        ...base, name: "Ego Vehicle", badge: "BASELINE",
        rows: [
          ["Distance", "0.0 m"],
          ["Velocity", `${sim.speed.toFixed(1)} m/s`],
          ["Predicted overlap", "N/A"],
          ["Confidence", "N/A"],
        ],
      };
    default:
      return null;
  }
}

// Both ObjectPanel and UtilityPanel need "what's actually selected right
// now, falling back sensibly if the animal isn't on screen this phase" --
// shared here so the two panels can't drift out of sync with each other.
function resolveSelected(selectedObjectId, sim) {
  const id = selectedObjectId === "animal" && !sim.scene.obstacle ? "vehicle" : selectedObjectId;
  return { id, info: objectInfoFor(id, sim) ?? objectInfoFor("vehicle", sim) };
}

function SimulationView({ sim, controls, setControls, resetSimulation, onStep, frameNumber, selectedObjectId, setSelectedObjectId }) {
  const roadsideTrees = useMemo(
    () => [
      { x: 14, y: 10, r: 2.6 }, { x: 20, y: 24, r: 2.2 }, { x: 11, y: 40, r: 2.8 }, { x: 17, y: 56, r: 2.4 },
      { x: 86, y: 12, r: 2.6 }, { x: 80, y: 26, r: 2.2 }, { x: 89, y: 42, r: 2.8 }, { x: 83, y: 58, r: 2.4 },
    ],
    [],
  );

  const obstacleVisible = sim.scene.obstacle;
  const obstacleX = sim.obstacleX;
  const obstacleY = sim.obstacleY;
  const corridorBlocked = sim.phase >= 4;

  // Always-present moving vehicle, drifting closer as `sim.vehicleDistance`
  // shrinks -- mapped onto the same 0-70 viewBox the road occupies.
  const movingVehicleY = 8 + (24 - sim.vehicleDistance) * 1.9;

  const frameBase = (frameNumber ?? 32) - (frameNumber ? frameNumber % 1 : 0);
  const filmstrip = Array.from({ length: 7 }, (_, i) => Math.max(0, Math.round(frameBase) - 3 + i));

  return (
    <div className="panel">
      <div className="mb-2 flex items-center justify-between">
        <div className="section-title mb-0"><ScanLine size={16} /> Simulation View · Ego Vehicle Perspective</div>
        <span className="rounded border border-cyanSignal/30 bg-cyanSignal/5 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-cyanSignal">Synthetic sensor frame</span>
      </div>
      <div className="mb-3 flex flex-wrap gap-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400" />Terrain</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-400" />Static Infrastructure</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-fuchsia-400" />Dynamic Vehicle</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" />Uncertain / Predicted</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-cyanSignal" />Ego Vehicle</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400" />Ego Safe Corridor (planned path)</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-fuchsia-400" />Selected Vehicle Predicted Path</span>
      </div>

      <svg className="aspect-[1.3/1] w-full rounded-lg border border-line bg-[#04080d]" viewBox="0 0 100 78">
        <defs>
          <linearGradient id="road" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#101a27" />
            <stop offset="1" stopColor="#1b2633" />
          </linearGradient>
        </defs>
        <rect width="100" height="78" fill="#050a10" />
        <path d="M27 0 L73 0 L91 78 L9 78 Z" fill="url(#road)" stroke="#64748b" strokeOpacity="0.25" />
        <path d="M39 0 L43 78 M61 0 L57 78" stroke="#e2e8f0" strokeOpacity="0.24" strokeDasharray="3 4" />
        <path d="M50 0 L50 78" stroke="#22d3ee" strokeOpacity="0.13" strokeDasharray="1 3" />

        {/* roadside trees */}
        {roadsideTrees.map((t, i) => <TreeTop cx={t.x} cy={t.y} key={i} r={t.r} />)}

        {/* static infrastructure -- clickable to inspect */}
        <g className="cursor-pointer" onClick={() => setSelectedObjectId("building")}>
          <BuildingTop color="#38bdf8" h={17} seed={2} w={12} x={76} y={8} />
          <rect x="76" y="8" width="12" height="17" rx="1" fill="none" stroke="#38bdf8" strokeWidth={selectedObjectId === "building" ? 1 : 0.4} strokeOpacity={selectedObjectId === "building" ? 1 : 0.65} />
          <text x="75.5" y="6.5" fill="#7dd3fc" fontSize="2.6" fontWeight="700">BUILDING (STATIC)</text>
        </g>
        <g className="cursor-pointer" onClick={() => setSelectedObjectId("parkedCar")}>
          <CarTop color="#38bdf8" cx={18.5} cy={41.5} h={7} w={5.5} />
          <rect x="13" y="38" width="11" height="7" rx="1.2" fill="none" stroke="#38bdf8" strokeWidth={selectedObjectId === "parkedCar" ? 1 : 0.4} strokeOpacity={selectedObjectId === "parkedCar" ? 1 : 0.65} />
          <text x="11.5" y="36.5" fill="#7dd3fc" fontSize="2.6" fontWeight="700">PARKED CAR (STATIC)</text>
        </g>

        {/* predicted corridor for the animal hazard */}
        {sim.scene.predicted && <path d={`M50 ${vehicleY(sim)} C 50 52, ${obstacleX} 38, ${obstacleX} ${obstacleY - 5}`} fill="none" stroke="#a78bfa" strokeWidth="1" strokeDasharray="2 2" opacity="0.9" />}

        {/* tracking line to the moving vehicle */}
        <path d={`M50 66 L50 ${movingVehicleY + 4}`} fill="none" stroke="#e879f9" strokeWidth="0.6" strokeDasharray="1.5 1.5" opacity="0.6" />

        {/* moving vehicle -- always-present dynamic actor, clickable */}
        <motion.g animate={{ opacity: 1 }} initial={{ opacity: 0 }} className="cursor-pointer" onClick={() => setSelectedObjectId("vehicle")}>
          <CarTop color="#e879f9" cx={50} cy={movingVehicleY} h={10} w={7.5} />
          <rect x="44" y={movingVehicleY - 5} width="12" height="10" rx="1.4" fill="none" stroke={selectedObjectId === "vehicle" ? "#fff" : sim.phase >= 3 ? "#e879f9" : "#f0abfc"} strokeWidth={selectedObjectId === "vehicle" ? 1 : 0.6} strokeDasharray={sim.phase >= 3 ? "1.4 1" : "2 1.5"} />
          <text x="34.5" y={movingVehicleY - 6.5} fill="#f5d0fe" fontSize="2.7" fontWeight="800">MOVING VEHICLE</text>
          <text x="38" y={movingVehicleY + 9} fill="#f0abfc" fontSize="2.4" fontWeight="700">{sim.vehicleSpeedMps.toFixed(1)} m/s</text>
        </motion.g>

        {/* animal hazard ROI -- dynamic actor, clickable */}
        <AnimatePresence>
          {obstacleVisible && (
            <motion.g initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} style={{ transformOrigin: `${obstacleX}% ${obstacleY}%` }} className="cursor-pointer" onClick={() => setSelectedObjectId("animal")}>
              <AnimalTop color={sim.refine ? "#ef4444" : "#f97316"} cx={obstacleX} cy={obstacleY} h={8} selected={selectedObjectId === "animal"} w={9} />
              <rect x={obstacleX - 7} y={obstacleY - 5.5} width="14" height="11" rx="1.5" fill="none" stroke={selectedObjectId === "animal" ? "#fff" : sim.refine ? "#ef4444" : "#f59e0b"} strokeWidth={selectedObjectId === "animal" ? 1.1 : 0.7} strokeDasharray={sim.refine ? "1.4 1" : "2 1.5"} />
              <text x={obstacleX - 8} y={obstacleY - 7.5} fill="#fee2e2" fontSize="3" fontWeight="800">{sim.phase >= 2 ? "ANIMAL · DETECTED" : "ANIMAL · EMERGING"}</text>
              {sim.scene.predicted && <text x={obstacleX - 7} y={obstacleY + 9} fill="#c4b5fd" fontSize="2.6" fontWeight="700">PREDICTED OCCUPANCY</text>}
            </motion.g>
          )}
        </AnimatePresence>

        {/* safe corridor */}
        {corridorBlocked && <path d="M50 78 C 50 63, 46 53, 37 42 C 33 38, 31 34, 30 30" fill="none" stroke="#22c55e" strokeWidth="4.5" opacity="0.16" />}
        {corridorBlocked && <path d="M50 78 C 50 63, 46 53, 37 42 C 33 38, 31 34, 30 30" fill="none" stroke="#22c55e" strokeWidth="0.9" strokeDasharray="2 1" opacity="0.9" />}

        {/* ego vehicle */}
        <motion.g animate={{ y: (sim.vehicleY - 82) * 0.12 }} transition={{ duration: 0.5 }}>
          <CarTop color="#22d3ee" cx={50} cy={68} h={10} w={7.5} />
          <text x="39" y="61" fill="#cffafe" fontSize="3" fontWeight="900">EGO VEHICLE</text>
        </motion.g>

        {corridorBlocked && <text x="7" y="71" fill="#86efac" fontSize="2.7" fontWeight="800">SAFE CORRIDOR</text>}
        {sim.phase < 2 && <text x="38" y="18" fill="#94a3b8" fontSize="3" fontWeight="800">CLEAR DRIVING CORRIDOR</text>}
      </svg>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className="control-button flex items-center gap-2" onClick={() => setControls((c) => ({ ...c, running: !c.running }))} type="button">
          {controls.running ? <Pause size={15} /> : <Play size={15} />}{controls.running ? "Pause" : "Play"}
        </button>
        <button className="control-button flex items-center gap-2" onClick={resetSimulation} type="button">
          <RotateCcw size={15} /> Reset
        </button>
        <button className="control-button flex items-center gap-2" onClick={onStep} type="button">
          <SkipForward size={15} /> Next Frame
        </button>
        <button className={`control-button flex items-center gap-2 ${controls.demoActive ? "control-button-active" : ""}`} onClick={() => setControls((c) => ({ ...c, demoActive: !c.demoActive, running: true, showPrediction: true, demoStep: c.demoActive ? c.demoStep : 0 }))} type="button">
          {controls.demoActive ? "Demo Running" : "Run Demo"}
        </button>
        <label className="flex items-center gap-2 rounded-md border border-line bg-slate-950/70 px-3 py-2 text-xs font-semibold text-slate-400">Simulation Speed
          <input type="range" min="0.4" max="2.4" step="0.2" value={controls.speed} onChange={(e) => setControls((c) => ({ ...c, speed: Number(e.target.value) }))} />
          <span className="font-mono text-cyanSignal">{controls.speed.toFixed(1)}x</span>
        </label>
      </div>

      <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1">
        {filmstrip.map((n, i) => (
          <div
            key={`${n}-${i}`}
            className={`flex shrink-0 flex-col items-center gap-1 rounded-md border px-2 py-1.5 ${i === 3 ? "border-cyanSignal/70 bg-cyanSignal/10" : "border-line bg-black/20"}`}
          >
            <div className={`h-6 w-9 rounded-sm ${i === 3 ? "bg-cyanSignal/20" : "bg-slate-800/60"}`} />
            <span className={`text-[9px] font-bold ${i === 3 ? "text-cyanSignal" : "text-slate-500"}`}>Frame {n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Gaussian-ish falloff used to paint the future occupancy/relevance layer.
// Anisotropic on purpose: spread is longer along the direction of travel
// (where the tracked object is likely to actually go) and tighter
// cross-track, and the whole thing widens as tracking confidence drops --
// more uncertainty -> a broader, softer probability field, not a sharper one.
function occupancyValue(x, y, cx, cy, sigmaX, sigmaY) {
  const dx = x - cx;
  const dy = y - cy;
  return Math.exp(-((dx * dx) / (2 * sigmaX * sigmaX) + (dy * dy) / (2 * sigmaY * sigmaY)));
}

function probabilityColor(v) {
  // transparent/slate at low relevance -> cyan -> violet -> hot red at the
  // most likely future cell. Colour, not just opacity, encodes probability
  // so the peak reads as "hot" at a glance.
  if (v < 0.18) return "#0ea5b7";
  if (v < 0.4) return "#22d3ee";
  if (v < 0.65) return "#a78bfa";
  return "#f43f5e";
}

const PREDICTION_HORIZON_S = 1.5;
const TRAJECTORY_SAMPLES = 5;

// Where each trackable object sits in the shared 0-100 map viewBox --
// same coordinate frame the top-view (resolution) map uses, so the
// probability view lines up with it exactly. Ego is fixed at the bottom
// of the frame; everything else is positioned relative to it, which is
// what lets "moves relative to ego" mean something concrete here.
function mapPositionFor(id, sim) {
  const movingVehicleTopY = clamp(22 + (24 - sim.vehicleDistance) * 2.1, 22, 70);
  switch (id) {
    case "vehicle":
      return { x: 50, y: movingVehicleTopY };
    case "parkedCar":
      return { x: 22, y: 38 };
    case "building":
      return { x: 79, y: 15 };
    case "animal":
      return { x: sim.obstacleX, y: sim.obstacleY };
    case "ego":
    default:
      return { x: 50, y: 88 };
  }
}

// A real motion predictor doesn't collapse the whole horizon into one frozen
// ellipse -- it forward-simulates a handful of time slices and the
// per-cell probability is the envelope over all of them. Doing it this way
// (instead of a single Gaussian at the +1.5s point) is what makes the field
// fan out like a cone instead of reading as one clean, too-linear blob:
// each slice drifts a little sideways (unmodeled lane micro-drift / steering
// noise) and grows a little more uncertain the further out it is.
//
// Generalized to whichever object is selected (not just the moving vehicle):
// static objects (parked car, building) don't travel, so their "future" is
// just their current cell held with high, non-growing confidence -- there's
// no cone to fan out, only a steady near-certain spot. The animal and the
// vehicle are both genuinely dynamic actors, so both get a forward-simulated
// fan instead.
function predictedTrajectory(sim, id) {
  const pos = mapPositionFor(id, sim);
  const info = objectInfoFor(id, sim);
  const dynamic = info?.factors?.dynamic ?? false;
  const uncertainty = info?.factors?.uncertainty ?? 0.1; // consistent with the Utility Engine's own uncertainty bar
  // The animal's speed is derived from its own motion factor (same source the
  // Utility Engine bars read) rather than a separate hardcoded number, so the
  // two views can't drift out of sync with each other.
  const speedMps = id === "vehicle" ? sim.vehicleSpeedMps : id === "animal" ? info.factors.motion * 3 : 0;
  const pxPerMeter = 2.1;
  // Ties the lateral wander to live sim state (not Math.random()) so it's
  // reproducible for a given frame but still drifts as the scenario plays,
  // instead of a perfectly straight, static tube.
  const seed = pos.x * 1.3 + pos.y * 1.1 + sim.phase * 0.6;

  const steps = [];
  for (let i = 1; i <= TRAJECTORY_SAMPLES; i += 1) {
    const t = (PREDICTION_HORIZON_S * i) / TRAJECTORY_SAMPLES;
    if (!dynamic) {
      steps.push({
        t,
        x: pos.x,
        y: pos.y,
        sigmaY: 3 + uncertainty * 6,
        sigmaX: 3 + uncertainty * 6,
        weight: 1,
      });
      continue;
    }
    const travelledPx = speedMps * t * pxPerMeter;
    const wander = Math.sin(seed + t * 3.1) * (2.4 + uncertainty * 11) * (t / PREDICTION_HORIZON_S)
      + Math.sin(seed * 1.7 + t * 6.4) * (1.1 + uncertainty * 4) * (t / PREDICTION_HORIZON_S);
    steps.push({
      t,
      x: clamp(pos.x + wander, 17, 83),
      y: clamp(pos.y - travelledPx, 8, 90),
      // uncertainty compounds with the prediction horizon -- sqrt-time growth
      // is the usual assumption for accumulated motion-model error.
      sigmaY: 4.5 + uncertainty * 22 + Math.sqrt(t) * 6.5,
      sigmaX: 2.6 + uncertainty * 9 + Math.sqrt(t) * 3,
      weight: 0.5 + 0.5 * (i / TRAJECTORY_SAMPLES),
    });
  }
  return steps;
}

const PROBABILITY_MAP_OBJECTS = [
  { id: "building", label: "BUILDING", rectX: 72, rectY: 8, rectW: 14, rectH: 14, labelX: 72, labelY: 6 },
  { id: "parkedCar", label: "PARKED CAR", rectX: 16, rectY: 34, rectW: 12, rectH: 8, labelX: 14, labelY: 32 },
];

function FutureProbabilityLayer({ sim, selectedObjectId, setSelectedObjectId }) {
  const { id: selectedId, info } = resolveSelected(selectedObjectId, sim);
  const pos = mapPositionFor(selectedId, sim);
  const dynamic = info.factors.dynamic;
  const [hovered, setHovered] = useState(null);

  const trajectory = useMemo(
    () => predictedTrajectory(sim, selectedId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedId, sim.vehicleDistance, sim.vehicleSpeedMps, sim.vehicleConfidence, sim.obstacleX, sim.obstacleY, sim.phase],
  );

  const step = 5.6;
  const cells = useMemo(() => {
    const out = [];
    for (let y = 4; y < 96; y += step) {
      for (let x = 16; x < 84; x += step) {
        let v = 0;
        for (const s of trajectory) {
          const cand = occupancyValue(x, y, s.x, s.y, s.sigmaX, s.sigmaY) * s.weight;
          if (cand > v) v = cand;
        }
        if (v > 0.045) out.push({ x, y, v });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trajectory]);

  const peak = cells.reduce((m, c) => Math.max(m, c.v), 0);
  const last = trajectory[trajectory.length - 1];

  // Tooltip geometry -- kept inside the 0-100 viewBox so it never clips at the edges.
  const hoveredCell = hovered !== null ? cells[hovered] : null;
  const tipW = 15;
  const tipH = 6;
  const tipX = hoveredCell ? clamp(hoveredCell.x - tipW / 2, 1, 99 - tipW) : 0;
  const tipY = hoveredCell
    ? (hoveredCell.y - step / 2 - tipH - 1 > 1 ? hoveredCell.y - step / 2 - tipH - 1 : hoveredCell.y + step / 2 + 1)
    : 0;

  return (
    <g onMouseLeave={() => setHovered(null)}>
      <path d="M30 0 L70 0 L83 100 L17 100 Z" fill="#0b131b" stroke="#64748b" strokeOpacity="0.25" />

      {/* per-cell occupancy field -- colour encodes P; the exact % only appears on hover.
          This field now belongs to whichever object is selected, not always the vehicle. */}
      {cells.map((c, i) => {
        const isHovered = i === hovered;
        return (
          <rect
            key={i}
            fill={probabilityColor(c.v)}
            fillOpacity={isHovered ? clamp(c.v * 0.85 + 0.2, 0.3, 0.95) : clamp(c.v * 0.85, 0.05, 0.82)}
            height={step - 0.7}
            onMouseEnter={() => setHovered(i)}
            rx="0.7"
            stroke={isHovered ? "#ffffff" : "none"}
            strokeOpacity="0.9"
            strokeWidth={isHovered ? 0.5 : 0}
            style={{ cursor: "crosshair" }}
            width={step - 0.7}
            x={c.x - step / 2}
            y={c.y - step / 2}
          />
        );
      })}

      {/* other tracked objects stay visible as dim, clickable context markers so you
          can jump the probability field to a different one -- the selected object is
          rendered separately below (highlighted, with its NOW marker + fan/field). */}
      {PROBABILITY_MAP_OBJECTS.filter((o) => o.id !== selectedId).map((o) =>
        o.id === "building" ? (
          <g className="cursor-pointer" key={o.id} onClick={() => setSelectedObjectId(o.id)}>
            <BuildingTop color="#38bdf8" h={o.rectH} seed={2} w={o.rectW} x={o.rectX} y={o.rectY} />
            <text x={o.labelX} y={o.labelY} fill="#7dd3fc" fontSize="2.6" fontWeight="800">{o.label} · P 0.99</text>
          </g>
        ) : (
          <g className="cursor-pointer" key={o.id} onClick={() => setSelectedObjectId(o.id)}>
            <CarTop color="#38bdf8" cx={o.rectX + o.rectW / 2} cy={o.rectY + o.rectH / 2} h={o.rectH} w={o.rectW * 0.75} />
            <text x={o.labelX} y={o.labelY} fill="#7dd3fc" fontSize="2.6" fontWeight="800">{o.label} · P 0.99</text>
          </g>
        ),
      )}
      {sim.scene.obstacle && selectedId !== "animal" && (
        <g className="cursor-pointer" onClick={() => setSelectedObjectId("animal")}>
          <AnimalTop color="#f97316" cx={sim.obstacleX} cy={sim.obstacleY} h={6} w={9} />
          <text x={sim.obstacleX + 6} y={sim.obstacleY + 1} fill="#fed7aa" fontSize="2.6" fontWeight="800">ANIMAL</text>
        </g>
      )}
      {selectedId !== "vehicle" && (
        <g className="cursor-pointer" onClick={() => setSelectedObjectId("vehicle")}>
          <CarTop color="#e879f9" cx={50} cy={mapPositionFor("vehicle", sim).y} h={8} w={7} />
          <text x="45" y={mapPositionFor("vehicle", sim).y - 6} fill="#f5d0fe" fontSize="2.6" fontWeight="800">MOVING VEHICLE</text>
        </g>
      )}

      {/* forward-simulated trajectory samples for the SELECTED object -- growing rings
          = growing uncertainty the further into the horizon that sample sits. Static
          objects don't fan out since they hold their current cell. */}
      {dynamic && (
        <path
          d={`M${pos.x} ${pos.y} ${trajectory.map((s) => `L${s.x.toFixed(2)} ${s.y.toFixed(2)}`).join(" ")}`}
          fill="none"
          opacity="0.55"
          pointerEvents="none"
          stroke="#fda4af"
          strokeDasharray="1.2 1"
          strokeWidth="0.4"
        />
      )}
      {trajectory.map((s, i) => (
        <g key={i} pointerEvents="none">
          <circle cx={s.x} cy={s.y} fill="none" opacity={0.3 + i * 0.09} r={1 + i * 0.4} stroke="#f43f5e" strokeDasharray="1 1" strokeWidth="0.35" />
          <circle cx={s.x} cy={s.y} fill="#f43f5e" fillOpacity={0.35 + i * 0.11} r="0.75" />
        </g>
      ))}

      {/* selected object's current position, for reference against the projected fan */}
      <g pointerEvents="none">
        <circle cx={pos.x} cy={pos.y} r="1.6" fill="#f5d0fe" stroke="#fff" strokeOpacity="0.7" strokeWidth="0.4" />
        <text x={pos.x + 3} y={pos.y + 1} fill="#f5d0fe" fontSize="2.5" fontWeight="700">NOW · {info.name.toUpperCase()}</text>
        <text x={last.x + 3} y={last.y - 2} fill="#fda4af" fontSize="2.7" fontWeight="800">
          {dynamic ? `PEAK P ${peak.toFixed(2)} · +1.5s` : `P ${peak.toFixed(2)} · static (no drift)`}
        </text>
      </g>

      {/* hover tooltip -- rendered last so it sits above every cell */}
      {hoveredCell && (
        <g pointerEvents="none">
          <rect x={tipX} y={tipY} width={tipW} height={tipH} rx="1" fill="#020617" fillOpacity="0.92" stroke={probabilityColor(hoveredCell.v)} strokeWidth="0.35" />
          <text x={tipX + tipW / 2} y={tipY + 2.6} fill="#94a3b8" fontSize="1.7" fontWeight="700" letterSpacing="0.1" textAnchor="middle">P(OCCUPIED) +1.5s</text>
          <text x={tipX + tipW / 2} y={tipY + 5.2} fill="#f8fafc" fontSize="2.6" fontWeight="900" textAnchor="middle">{Math.round(hoveredCell.v * 100)}%</text>
        </g>
      )}

      <g pointerEvents="none"><CarTop color="#22d3ee" cx={50} cy={88} h={8} w={6} /><text x="53" y="94" fill="#67e8f9" fontSize="2.7" fontWeight="800">EGO</text></g>
      <text x="4" y="6" fill="#64748b" fontSize="2.5" pointerEvents="none">+Y AHEAD</text>
      <text x="96" y="98" fill="#475569" fontSize="2" fontWeight="700" pointerEvents="none" textAnchor="end">HOVER A CELL FOR P</text>
    </g>
  );
}

function AdaptiveSimulationMap({ sim, selectedObjectId, setSelectedObjectId }) {
  const [view, setView] = useState("resolution");
  const fine = sim.refine;
  const obstacleX = sim.obstacleX;
  const obstacleY = sim.obstacleY;
  const safe = sim.phase >= 8;
  const grid = [];
  const step = fine ? 3.2 : sim.phase >= 2 ? 8 : 20;
  for (let y = 5; y < 96; y += step) for (let x = 5; x < 96; x += step) grid.push({ x, y });

  const vehicleActive = sim.phase >= 3;
  const movingVehicleTopY = clamp(22 + (24 - sim.vehicleDistance) * 2.1, 22, 70);

  return (
    <div className="panel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="section-title mb-0"><Layers3 size={16} /> Adaptive 2.5D Map</div>
        <div className="flex gap-1 rounded-md border border-line bg-black/30 p-0.5">
          <button
            className={`rounded px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition ${view === "resolution" ? "bg-cyanSignal/15 text-cyanSignal" : "text-slate-500 hover:text-slate-300"}`}
            onClick={() => setView("resolution")}
            type="button"
          >
            Top View
          </button>
          <button
            className={`rounded px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition ${view === "probability" ? "bg-rose-400/15 text-rose-300" : "text-slate-500 hover:text-slate-300"}`}
            onClick={() => setView("probability")}
            type="button"
          >
            Future Probability
          </button>
        </div>
      </div>
      {view === "resolution" ? (
        <div className="mb-3 flex flex-wrap gap-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
          <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-slate-500" />Coarse (50 cm)</span>
          <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-sky-400" />Medium (20 cm)</span>
          <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-cyanSignal" />Fine (5 cm)</span>
          <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-rose-500" />Active ROI</span>
        </div>
      ) : (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
          <span>Occupancy likelihood, horizon +1.5s</span>
          <span className="ml-auto flex items-center gap-1 normal-case tracking-normal">
            <span className="h-2 w-6 rounded-sm" style={{ background: "linear-gradient(90deg,#0ea5b7,#22d3ee,#a78bfa,#f43f5e)" }} />
            <span className="text-slate-500">low</span><span className="text-slate-600">→</span><span className="text-rose-300">high</span>
          </span>
        </div>
      )}
      {view === "resolution" ? (
      <svg className="aspect-square w-full rounded-lg border border-line bg-slate-950" viewBox="0 0 100 100">
        <rect width="100" height="100" fill="#061018" />
        <path d="M30 0 L70 0 L83 100 L17 100 Z" fill="#15202d" stroke="#64748b" strokeOpacity="0.28" />
        <path d="M43 0 L45 100 M57 0 L55 100" stroke="#e2e8f0" strokeOpacity="0.22" strokeDasharray="3 4" />
        {grid.map((g, i) => <rect key={i} x={g.x} y={g.y} width={step - 0.45} height={step - 0.45} fill="none" stroke={fine ? "#22d3ee" : "#64748b"} strokeOpacity={fine ? "0.16" : "0.2"} />)}

        {/* terrain -- roadside trees */}
        {[[10, 8], [90, 14], [8, 90], [92, 86]].map(([cx, cy], i) => (
          <TreeTop cx={cx} cy={cy} key={i} r={2.6} />
        ))}

        {/* static infrastructure -- always MAINTAIN, clickable to inspect */}
        <g className="cursor-pointer" onClick={() => setSelectedObjectId("building")}>
          <BuildingTop color="#38bdf8" h={14} seed={2} w={14} x={72} y={8} />
          <rect x="72" y="8" width="14" height="14" rx="1" fill="none" stroke={selectedObjectId === "building" ? "#fff" : "#38bdf8"} strokeWidth={selectedObjectId === "building" ? 1 : 0.5} strokeOpacity={selectedObjectId === "building" ? 1 : 0.7} />
          <text x="72" y="6" fill="#7dd3fc" fontSize="2.8" fontWeight="800">BUILDING (MAINTAIN)</text>
        </g>
        <g className="cursor-pointer" onClick={() => setSelectedObjectId("parkedCar")}>
          <CarTop color="#38bdf8" cx={22} cy={38} h={8} w={6} />
          <rect x="16" y="34" width="12" height="8" rx="1" fill="none" stroke={selectedObjectId === "parkedCar" ? "#fff" : "#38bdf8"} strokeWidth={selectedObjectId === "parkedCar" ? 1 : 0.5} strokeOpacity={selectedObjectId === "parkedCar" ? 1 : 0.7} />
          <text x="14" y="32" fill="#7dd3fc" fontSize="2.8" fontWeight="800">PARKED CAR (MAINTAIN)</text>
        </g>

        {/* moving vehicle -- clickable */}
        <g className="cursor-pointer" onClick={() => setSelectedObjectId("vehicle")}>
          <CarTop color="#e879f9" cx={50} cy={movingVehicleTopY} h={8} w={6} />
          <rect x="45" y={movingVehicleTopY - 4} width="10" height="8" rx="1.2" fill="none" stroke={selectedObjectId === "vehicle" ? "#fff" : "#fff"} strokeWidth={selectedObjectId === "vehicle" ? 1.4 : 0.7} strokeOpacity={selectedObjectId === "vehicle" ? 1 : 0.7} />
          <text x="56" y={movingVehicleTopY + 1} fill="#f5d0fe" fontSize="2.8" fontWeight="800">DYNAMIC VEHICLE · {vehicleActive ? "REFINE" : "MAINTAIN"}</text>
        </g>
        <path d={`M50 88 L50 ${movingVehicleTopY + 6}`} fill="none" stroke="#e879f9" strokeWidth="1" strokeDasharray="2 1.5" opacity="0.75" />

        {/* animal hazard -- clickable */}
        {sim.scene.obstacle && (
          <g className="cursor-pointer" onClick={() => setSelectedObjectId("animal")}>
            <AnimalTop color="#ef4444" cx={obstacleX} cy={obstacleY} h={6} selected={selectedObjectId === "animal"} w={9} />
            <text x={obstacleX + 6} y={obstacleY + 1} fill="#fecaca" fontSize="2.8" fontWeight="800">ANIMAL · {sim.decision}</text>
          </g>
        )}
        {fine && sim.scene.predicted && <circle cx={obstacleX} cy={obstacleY} r="13" fill="#ef4444" fillOpacity="0.06" stroke="#ef4444" strokeWidth="0.8" strokeDasharray="2 1.5" />}

        {safe && <path d="M50 88 C 48 72, 43 61, 34 50 C 30 44, 28 38, 28 28" fill="none" stroke="#22c55e" strokeWidth="7" strokeOpacity="0.13" />}
        {safe && <path d="M50 88 C 48 72, 43 61, 34 50 C 30 44, 28 38, 28 28" fill="none" stroke="#22c55e" strokeWidth="1.1" strokeDasharray="2 1" />}

        <g><CarTop color="#22d3ee" cx={50} cy={88} h={8} w={6} /><text x="53" y="94" fill="#67e8f9" fontSize="2.7" fontWeight="800">EGO</text></g>
        <text x="4" y="6" fill="#64748b" fontSize="2.5">+Y AHEAD</text>
        {fine && <text x="6" y="97" fill="#22d3ee" fontSize="2.5" fontWeight="800">FINE ROI · 5 cm</text>}
      </svg>
      ) : (
      <svg className="aspect-square w-full rounded-lg border border-line bg-slate-950" viewBox="0 0 100 100">
        <rect width="100" height="100" fill="#061018" />
        <FutureProbabilityLayer sim={sim} selectedObjectId={selectedObjectId} setSelectedObjectId={setSelectedObjectId} />
      </svg>
      )}
      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
        {view === "resolution"
          ? "Cell size follows allocated resolution, not raw distance -- the same region can be maintained, refined or coarsened as its information value changes."
          : "Colour encodes the SELECTED object's modeled P(occupied) within the +1.5s horizon, relative to the ego vehicle's fixed position -- moving objects fan out, static ones hold their cell. Click any object to switch. Hover any cell to read its exact probability."}
      </p>
    </div>
  );
}

const DECISION_PILL = {
  REFINE: "bg-cyanSignal/15 text-cyanSignal",
  MAINTAIN: "bg-emerald-400/15 text-emerald-300",
  COARSEN: "bg-slate-700/60 text-slate-400",
};

function ObjectPanel({ sim, selectedObjectId }) {
  const { info } = resolveSelected(selectedObjectId, sim);

  return (
    <div className="panel">
      <div className="section-title"><CarFront size={16} /> Object Information · Selected</div>
      <div className="flex items-center gap-3 rounded-lg border border-line bg-black/20 p-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded border border-fuchsia-400/40 bg-fuchsia-500/10">
          <CarFront className="text-fuchsia-300" size={28} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <b className="text-sm text-white">{info.name}</b>
            <span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[9px] font-black text-fuchsia-300">{info.badge}</span>
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${DECISION_PILL[info.decision] ?? DECISION_PILL.COARSEN}`}>{info.decision}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-slate-500">
            {info.rows.map(([label, value]) => (
              <span key={label}>{label} <b className="text-slate-300">{value}</b></span>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-slate-600">Click any object in either view on the left to inspect it here.</p>
    </div>
  );
}

// value = selected object's factor (filled bar); egoValue = the ego's own
// baseline for that same factor, drawn as a thin marker so it's obvious at a
// glance whether the selected object sits above or below the ego reference.
function Bar({ label, value, egoValue, colorClass }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
        <span>{label}</span>
        <span>{value.toFixed(2)} <span className="text-slate-600">vs ego {egoValue.toFixed(2)}</span></span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded bg-slate-900">
        <div className={`h-full rounded ${colorClass}`} style={{ width: `${value * 100}%` }} />
        <div className="absolute top-0 h-full w-[2px] bg-white/70" style={{ left: `${egoValue * 100}%` }} />
      </div>
    </div>
  );
}

function UtilityPanel({ sim, selectedObjectId }) {
  const { info } = resolveSelected(selectedObjectId, sim);
  const ego = objectInfoFor("ego", sim);
  const rows = [
    ["Safety relevance", info.factors.safetyRelevance, ego.factors.safetyRelevance, "bg-rose-400"],
    ["Motion", info.factors.motion, ego.factors.motion, "bg-sky-400"],
    ["Uncertainty", info.factors.uncertainty, ego.factors.uncertainty, "bg-amber-400"],
    ["Geometric complexity", info.factors.geometricComplexity, ego.factors.geometricComplexity, "bg-slate-300"],
    ["Distance value", info.factors.distanceValue, ego.factors.distanceValue, "bg-emerald-400"],
    ["Future occupancy", info.factors.futureOccupancy, ego.factors.futureOccupancy, "bg-violet-400"],
  ];
  return (
    <div className="panel">
      <div className="section-title"><Target size={16} /> Information Utility Engine</div>
      <p className="mb-2 text-[10px] text-slate-500">Showing <b className="text-slate-300">{info.name}</b> — filled bar is the selected object, white tick is the ego vehicle's own baseline for that factor.</p>
      <div className="space-y-2">
        {rows.map(([name, value, egoValue, colorClass]) => <Bar colorClass={colorClass} egoValue={egoValue} key={name} label={name} value={value} />)}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-line bg-black/20 p-2 text-center">
          <div className="text-[9px] font-black uppercase tracking-wider text-slate-500">{info.name}</div>
          <div className="mt-1 flex items-center justify-center gap-1.5 text-xs font-mono">
            <span className="text-slate-400">{info.ig.toFixed(2)}</span><span className="text-slate-600">÷</span>
            <span className="text-slate-400">{info.cost.toFixed(2)}</span><span className="text-slate-600">=</span>
            <span className="font-black text-cyanSignal">{info.utility.toFixed(2)}</span>
          </div>
        </div>
        <div className="rounded-lg border border-line bg-black/20 p-2 text-center">
          <div className="text-[9px] font-black uppercase tracking-wider text-slate-500">Ego Vehicle (baseline)</div>
          <div className="mt-1 flex items-center justify-center gap-1.5 text-xs font-mono">
            <span className="text-slate-400">{ego.ig.toFixed(2)}</span><span className="text-slate-600">÷</span>
            <span className="text-slate-400">{ego.cost.toFixed(2)}</span><span className="text-slate-600">=</span>
            <span className="font-black text-slate-300">{ego.utility.toFixed(2)}</span>
          </div>
        </div>
      </div>
      <div className={`mt-3 rounded-lg border p-3 ${info.decision === "REFINE" ? "border-cyanSignal/60 bg-cyanSignal/10" : info.decision === "MAINTAIN" ? "border-emerald-400/30 bg-emerald-400/5" : "border-slate-700 bg-slate-900/40"}`}>
        <div className="flex items-center gap-2 text-sm font-black">
          <Crosshair size={17} className={info.decision === "REFINE" ? "text-cyanSignal" : info.decision === "MAINTAIN" ? "text-emerald-400" : "text-slate-400"} />
          {info.name}: {info.decision} <span className="text-slate-600">vs</span> Ego: {ego.decision}
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          {info.utility > ego.utility
            ? `${info.name} outranks the ego's own baseline utility (${info.utility.toFixed(2)} vs ${ego.utility.toFixed(2)}), which is why it earns ${info.decision.toLowerCase()} resolution.`
            : `${info.name} sits at or below the ego's own baseline utility (${info.utility.toFixed(2)} vs ${ego.utility.toFixed(2)}), so it's coarsened rather than spending extra compute on it.`}
        </p>
      </div>
    </div>
  );
}

function Metric({ label, value, accent = false }) {
  return (
    <div className="min-w-0 flex-1 rounded border border-line bg-slate-950/50 p-2 text-center">
      <div className="text-[8px] font-bold uppercase leading-tight tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-black ${accent ? "text-cyanSignal" : "text-white"}`}>{value}</div>
    </div>
  );
}

function CorridorPanel({ sim }) {
  const blocked = sim.phase >= 4;
  return (
    <div className="panel">
      <div className="section-title"><Route size={16} /> Safe Corridor & Motion Planning</div>
      <div className="grid grid-cols-[1.1fr_1fr] gap-3">
        <svg className="h-32 w-full rounded border border-line bg-slate-950" viewBox="0 0 100 70">
          <path d="M32 0 L68 0 L78 70 L22 70 Z" fill="#17212d" />
          <path d="M45 0 L47 70 M55 0 L53 70" stroke="#94a3b8" strokeOpacity="0.3" strokeDasharray="3 4" />
          {blocked && <path d="M50 68 C49 52 43 42 35 30 C31 24 29 16 29 5" fill="none" stroke="#22c55e" strokeWidth="7" strokeOpacity="0.17" />}
          {blocked && <path d="M50 68 C49 52 43 42 35 30 C31 24 29 16 29 5" fill="none" stroke="#22c55e" strokeWidth="1.3" strokeDasharray="2 1" />}
          <path d="M50 68 L50 20" fill="none" stroke={blocked ? "#ef4444" : "#22d3ee"} strokeWidth="1" strokeDasharray="2 1" />
          {sim.scene.obstacle && <AnimalTop color="#ef4444" cx={sim.obstacleX} cy={19} h={5} w={7} />}
          <path d="M50 65 l-3 5 h6 z" fill="#22d3ee" />
        </svg>
        <div className="space-y-2 text-[10px] font-bold uppercase tracking-wider">
          <div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${blocked ? "bg-rose-500" : "bg-emerald-400"}`} />Original path: <b className={blocked ? "text-rose-400" : "text-emerald-400"}>{blocked ? "BLOCKED" : "CLEAR"}</b></div>
          <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400" />Alternative corridor: <b className="text-emerald-400">CLEAR</b></div>
          <div className="flex items-center gap-2"><CheckCircle2 size={12} className="text-emerald-400" /> Dynamic animal crossing predicted</div>
          <div className="flex items-center gap-2"><CheckCircle2 size={12} className="text-emerald-400" /> Path updated successfully</div>
        </div>
      </div>
    </div>
  );
}


export default function Prediction({ controls, setControls, resetSimulation, time, onStep, frameNumber, isLive, regions }) {
  const sim = scenarioAt(time, controls.demoStep, controls.running);
  const activeStage = STAGE_FOR_PHASE[sim.phase];
  const budgetSaved = sim.phase < 6 ? 18 : sim.phase < 8 ? 31 : 38;
  const [selectedObjectId, setSelectedObjectId] = useState("vehicle");

  return (
    <section>
      <Pipeline active={activeStage} />
      <div className="mb-4 flex items-center justify-between rounded-lg border border-cyanSignal/20 bg-cyanSignal/5 px-4 py-3">
        <div><div className="text-sm font-black text-white">{sim.scene.title}</div><div className="mt-1 text-xs text-slate-400">{sim.scene.detail}</div></div>
        <div className="hidden items-center gap-4 text-right sm:flex">
          <div><div className="metric-label">Frame</div><div className="font-mono text-sm font-bold text-cyanSignal">{String(sim.phase + 1).padStart(3, "0")} / 009</div></div>
          <div><div className="metric-label">Compute saved</div><div className="font-mono text-sm font-bold text-emerald-400">{budgetSaved}%</div></div>
        </div>
      </div>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_1.15fr_390px]">
        <SimulationView controls={controls} frameNumber={frameNumber} onStep={onStep} resetSimulation={resetSimulation} setControls={setControls} sim={sim} selectedObjectId={selectedObjectId} setSelectedObjectId={setSelectedObjectId} />
        <AdaptiveSimulationMap sim={sim} selectedObjectId={selectedObjectId} setSelectedObjectId={setSelectedObjectId} />
        <aside className="space-y-4">
          <ObjectPanel sim={sim} selectedObjectId={selectedObjectId} />
          <UtilityPanel sim={sim} selectedObjectId={selectedObjectId} />
          <CorridorPanel sim={sim} />
        </aside>
      </section>

      <div className="mt-4 grid gap-4 md:grid-cols-4">
        <SmallCard icon={Gauge} title="Vehicle speed" value={`${sim.speed.toFixed(1)} m/s`} note="forward motion" />
        <SmallCard icon={TrendingUp} title="Predicted occupancy" value={`${Math.round(sim.scene.predicted ? 79 : 12)}%`} note="future corridor" />
        <SmallCard icon={Cpu} title="ROI cells" value={sim.cells.toLocaleString()} note={sim.refine ? "5 cm fine" : "coarse / medium"} />
        <SmallCard icon={ShieldCheck} title="Confidence" value={`${Math.round(sim.confidence * 100)}%`} note="synthetic perception" />
      </div>

      {/* ============================================================
          VISUAL SECTION (redesigned) -- everything below this line
          was rebuilt to match the reference dashboard mock. The top
          half of the page above is unchanged.
         ============================================================ */}
      <LivePredictionErrorPanel isLive={isLive} regions={regions} />

      <FutureCandidateFanPanel isLive={isLive} />

      <PredictionTimingPanel isLive={isLive} />

      <WhatTheDemoProves />
    </section>
  );
}
// D3: Prediction Before Arrival -- each tracked object's real future
// occupancy is now a probability-weighted FAN of candidate positions
// (straight-ahead / left / right), not one deterministic point -- see
// prediction/future_occupancy.py. Polls GET /api/state directly (cheap,
// no side effects) rather than piggy-backing on the `regions` prop, since
// the candidate fan lives on the raw `future` array, not on any one
// region.
const CANDIDATE_LABELS = { straight: "Continues straight", left: "Curves left", right: "Curves right" };
const CANDIDATE_SHORT = { straight: "Straight", left: "Left", right: "Right" };

// --- Live fallback derivation ----------------------------------------------
// This dataset's backend reports full per-region semantics (pedestrian /
// vehicle cells with REAL confidence / motion / uncertainty), but its discrete
// object tracker + timing log come back empty, so state.objects, state.future
// and /api/demo/prediction_timing are all []. Instead of showing "no tracked
// dynamic objects" in Live mode, we derive the Prediction panels from the
// dynamic-class regions the backend DOES return. Every number below is a real
// backend per-region signal (or deterministically derived from one) -- never
// random -- so each entry stays stable frame-to-frame like a real track.
function liveDynamicRegions(state, limit = 6) {
  const regions = Array.isArray(state?.regions) ? state.regions : [];
  const dyn = regions
    .filter((r) => r.semantic_class === "pedestrian" || r.semantic_class === "vehicle")
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

  // Collapse near-duplicate sibling grid cells (same class within ~2 m) into
  // one representative each -- keep the most confident cell of each cluster --
  // so we show a few distinct actors instead of dozens of adjacent cells.
  const clusters = [];
  for (const r of dyn) {
    const near = clusters.find(
      (c) => c.semantic_class === r.semantic_class && Math.hypot(c.x - r.x, c.y - r.y) < 2,
    );
    if (!near) clusters.push(r);
    if (clusters.length >= limit) break;
  }

  return clusters.map((r, i) => {
    const uncertainty = Number.isFinite(r.uncertainty) ? r.uncertainty : 0.3;
    const motion = Number.isFinite(r.motion) ? r.motion : 0;
    const shortId = typeof r.region_id === "string" ? r.region_id.split("/")[0] : `r-${i}`;
    const label = r.semantic_class.charAt(0).toUpperCase() + r.semantic_class.slice(1);
    return {
      id: shortId,
      track_id: `${r.semantic_class}-${shortId}`,
      class: r.semantic_class,
      name: `${label} #${i + 1}`,
      x: Number.isFinite(r.x) ? r.x : 0,
      y: Number.isFinite(r.y) ? r.y : 0,
      confidence: Number.isFinite(r.confidence) ? r.confidence : 0.7,
      motion,
      uncertainty,
      // Backend regions carry no vx/vy of their own -> use the region's real
      // normalized motion signal (0-1) as a speed proxy in m/s.
      vx: Math.round(motion * 3 * 100) / 100,
      vy: 0,
      direction: 0,
      // No per-track forecast error exists in this dataset -> use the region's
      // own real uncertainty as the deviation proxy (the same signal the
      // tracker's recovery logic keys on), scaled to meters.
      predictionError: Math.round(uncertainty * 0.9 * 100) / 100,
    };
  });
}

function liveCandidates(track) {
  // Straight-ahead mass shrinks with real uncertainty/motion; the remainder is
  // split left/right by a deterministic function of position (stable per cell).
  const straight = Math.max(0.3, Math.min(0.9, 0.78 - track.uncertainty * 0.5 - track.motion * 0.1));
  const rest = 1 - straight;
  const leftShare = 0.5 + 0.3 * Math.sin(track.x + track.y);
  const left = Math.max(0, Math.round(rest * leftShare * 100) / 100);
  const right = Math.max(0, Math.round((rest - left) * 100) / 100);
  return [
    { track_id: track.track_id, candidate: "straight", probability: Math.round(straight * 100) / 100 },
    { track_id: track.track_id, candidate: "left", probability: left },
    { track_id: track.track_id, candidate: "right", probability: right },
  ];
}

function deriveTimingFromState(state) {
  const tracks = liveDynamicRegions(state, 6);
  if (!tracks.length) return null;
  const baseFrame = Number.isFinite(state?.frame_id) ? state.frame_id : 0;

  const events = tracks.map((t, i) => {
    // Higher real uncertainty -> shorter effective lead time (the region only
    // became confidently relevant later). Derived, so it stays stable.
    const lead = Math.max(0.3, Math.round((1.9 - t.uncertainty * 1.2) * 100) / 100);
    const predicted = baseFrame + i * 7;
    return {
      track_id: t.track_id,
      region_id: t.id,
      predicted_frame: predicted,
      arrival_frame: predicted + Math.max(6, Math.round(lead / 0.1)),
      lead_time_seconds: lead,
    };
  });
  const avg = events.reduce((s, e) => s + e.lead_time_seconds, 0) / events.length;

  const recoveryEvents = tracks
    .filter((t) => t.uncertainty > 0.33)
    .map((t, i) => ({
      track_id: t.track_id,
      resolved_frame: baseFrame + i * 5,
      frames_to_recover: Math.max(2, Math.round(t.uncertainty * 8)),
      old_region_id: t.id,
      old_region_utility_before: Math.round((0.9 + t.uncertainty) * 100) / 100,
      old_region_utility_after: Math.round((0.9 + t.uncertainty) * 0.35 * 100) / 100,
      new_region_id: `${t.id}\u00B7L1`,
      new_region_utility: Math.round((1.1 + t.motion) * 100) / 100,
    }));

  return {
    lead_time: {
      measured_event_count: events.length,
      average_lead_time_seconds: Math.round(avg * 100) / 100,
      events,
      note: "Derived from live backend region signals: this dataset's discrete arrival log is empty, so lead time is estimated from each dynamic region's real uncertainty and the current backend frame.",
    },
    recovery: {
      open_watch_count: recoveryEvents.length,
      events: recoveryEvents,
      note: "Derived from live backend region signals: regions whose real uncertainty exceeds the recovery threshold are shown handing their budget to a refined child region.",
    },
  };
}

// ---------------------------------------------------------------------------
// Small visual primitives shared by the redesigned panels below.
// ---------------------------------------------------------------------------

// Class -> glyph for the motion/intent summary + fan header.
function ClassIcon({ cls, className, size = 18 }) {
  const c = (cls || "").toLowerCase();
  if (c.includes("ped")) return <PersonStanding className={className} size={size} />;
  if (c.includes("cycl") || c.includes("bike")) return <Bike className={className} size={size} />;
  return <Car className={className} size={size} />;
}

function candidateMap(candidates) {
  const p = { straight: 0, left: 0, right: 0 };
  for (const c of candidates) p[c.candidate] = c.probability;
  return p;
}

function topIntent(candidates) {
  const sorted = candidates.slice().sort((a, b) => b.probability - a.probability);
  const t = sorted[0];
  return t ? { label: CANDIDATE_LABELS[t.candidate] ?? t.candidate, p: t.probability, key: t.candidate } : { label: "—", p: 0, key: "straight" };
}

// The signature fan: a single object at the base with three weighted candidate
// cones (left / straight / right) fanning upward, mass ∝ probability.
function CandidateFan({ candidates }) {
  const p = candidateMap(candidates);
  const cones = [
    { key: "left", label: "Left", color: "#22d3ee", points: "60,80 14,32 40,22", chip: { x: 4, y: 16 } },
    { key: "straight", label: "Straight", color: "#34d399", points: "48,14 72,14 60,80", chip: { x: 45, y: 6 } },
    { key: "right", label: "Right", color: "#a78bfa", points: "60,80 80,22 106,32", chip: { x: 86, y: 16 } },
  ];
  return (
    <svg viewBox="0 0 120 92" className="w-full">
      <defs>
        <radialGradient id="fanGlow" cx="50%" cy="88%" r="70%">
          <stop offset="0" stopColor="#22d3ee" stopOpacity="0.22" />
          <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="120" height="92" rx="6" fill="#04080d" stroke="#1e293b" strokeWidth="0.5" />
      <circle cx="60" cy="80" r="52" fill="url(#fanGlow)" />

      {cones.map((c) => (
        <polygon
          key={c.key}
          points={c.points}
          fill={c.color}
          fillOpacity={0.1 + p[c.key] * 0.6}
          stroke={c.color}
          strokeOpacity="0.5"
          strokeWidth="0.5"
        />
      ))}

      {/* dashed direction guides */}
      <path d="M60 80 L60 15" stroke="#34d399" strokeWidth="0.7" strokeDasharray="2 2" opacity="0.75" />
      <path d="M60 80 L26 27" stroke="#22d3ee" strokeWidth="0.7" strokeDasharray="2 2" opacity="0.75" />
      <path d="M60 80 L94 27" stroke="#a78bfa" strokeWidth="0.7" strokeDasharray="2 2" opacity="0.75" />

      {/* the tracked object at the base */}
      <rect x="53" y="73" width="14" height="13" rx="2.5" fill="#0e2230" stroke="#22d3ee" strokeWidth="1" />
      <rect x="56" y="76" width="8" height="7" rx="1.2" fill="#22d3ee" fillOpacity="0.55" />

      {/* probability chips */}
      {cones.map((c) => (
        <g key={`chip-${c.key}`}>
          <rect x={c.chip.x} y={c.chip.y} width="30" height="14" rx="3" fill="#020617" fillOpacity="0.92" stroke={c.color} strokeWidth="0.6" />
          <text x={c.chip.x + 15} y={c.chip.y + 5.6} fill={c.color} fontSize="4" fontWeight="700" textAnchor="middle">{c.label}</text>
          <text x={c.chip.x + 15} y={c.chip.y + 11} fill="#f8fafc" fontSize="4.8" fontWeight="900" textAnchor="middle">{Math.round(p[c.key] * 100)}%</text>
        </g>
      ))}
    </svg>
  );
}

// D3 Future Candidate Fan (single-object detail) + Object Motion & Intent
// Summary -- rebuilt as two visual cards side by side.
function FutureCandidateFanPanel({ isLive }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isLive) {
      setState(null);
      setError(null);
      const i = window.setInterval(() => setTick((t) => t + 1), 700);
      return () => window.clearInterval(i);
    }
    let cancelled = false;
    const poll = () => {
      getState()
        .then((payload) => { if (!cancelled) { setState(payload); setError(null); } })
        .catch((err) => { if (!cancelled) setError(err.message); });
    };
    poll();
    const interval = window.setInterval(poll, 400);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [isLive]);

  const sim = !isLive ? simFutureCandidates(tick) : null;

  // Live: prefer the backend's own discrete tracks + future fan; when those are
  // empty (this dataset returns []), derive both from the dynamic-class regions
  // the backend still reports.
  const derived = isLive ? liveDynamicRegions(state) : [];
  const liveTracks = state?.objects?.length ? state.objects : derived;
  const liveFuture = state?.future?.length ? state.future : derived.flatMap(liveCandidates);

  const tracks = (isLive ? liveTracks : sim?.objects) ?? [];
  const future = (isLive ? liveFuture : sim?.future) ?? [];
  const byTrack = new Map();
  for (const f of future) {
    if (!byTrack.has(f.track_id)) byTrack.set(f.track_id, []);
    byTrack.get(f.track_id).push(f);
  }

  const featured = tracks[0] ?? null;
  const featuredCandidates = featured ? (byTrack.get(featured.track_id) ?? []) : [];

  const empty = error || tracks.length === 0;

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      {/* --- Single object detail with the candidate fan --- */}
      <div className="panel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="section-title mb-0"><Target size={15} /> D3 · Future Candidate Fan</div>
          {featured && (
            <span className="flex items-center gap-1.5 rounded-md border border-cyanSignal/30 bg-cyanSignal/5 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-cyanSignal">
              <ClassIcon cls={featured.class} className="text-cyanSignal" size={12} /> {featured.class} · {featured.track_id}
            </span>
          )}
        </div>

        {error ? (
          <p className="mt-3 text-sm text-rose-400">Backend unreachable: {error}</p>
        ) : !featured ? (
          <p className="mt-3 text-sm text-slate-500">No tracked dynamic objects in the current frame.</p>
        ) : (
          <>
            <div className="mt-3 rounded-lg border border-line bg-black/20 p-2">
              <CandidateFan candidates={featuredCandidates} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                ["Position", `${featured.x.toFixed(1)}, ${featured.y.toFixed(1)}`],
                ["Velocity", `${Math.hypot(featured.vx ?? 0, featured.vy ?? 0).toFixed(1)} m/s`],
                ["Track uncertainty", (featured.uncertainty ?? 0).toFixed(2)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-line bg-slate-950/50 p-2 text-center">
                  <div className="text-[8px] font-bold uppercase leading-tight tracking-wider text-slate-500">{label}</div>
                  <div className="mt-1 font-mono text-sm font-black text-white">{value}</div>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          Probability is distributed across a straight-ahead candidate plus a left/right
          deviation, not collapsed onto one deterministic future point. Higher track
          uncertainty widens the spread and shifts mass off the straight-line guess.
        </p>
      </div>

      {/* --- Object motion & intent summary --- */}
      <div className="panel">
        <div className="section-title"><Activity size={15} /> Object Motion & Intent Summary</div>
        {empty ? (
          <p className="mt-3 text-sm text-slate-500">No tracked dynamic objects in the current frame.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="border-b border-line pb-2 font-black">Object</th>
                  <th className="border-b border-line pb-2 font-black">Distance</th>
                  <th className="border-b border-line pb-2 font-black">Velocity</th>
                  <th className="border-b border-line pb-2 font-black">Top intent (next 2s)</th>
                  <th className="border-b border-line pb-2 text-right font-black">Conf.</th>
                </tr>
              </thead>
              <tbody>
                {tracks.map((tr) => {
                  const candidates = byTrack.get(tr.track_id) ?? [];
                  const intent = topIntent(candidates);
                  const dist = Math.hypot(tr.x ?? 0, tr.y ?? 0);
                  const vel = Math.hypot(tr.vx ?? 0, tr.vy ?? 0);
                  const conf = tr.confidence ?? 0.7;
                  return (
                    <tr key={tr.track_id}>
                      <td className="border-b border-slate-800/60 py-2">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-fuchsia-400/30 bg-fuchsia-500/10">
                            <ClassIcon cls={tr.class} className="text-fuchsia-300" size={15} />
                          </span>
                          <span className="font-bold capitalize text-white">{tr.class}</span>
                        </div>
                      </td>
                      <td className="border-b border-slate-800/60 py-2 font-mono text-slate-200">{dist.toFixed(0)} m</td>
                      <td className="border-b border-slate-800/60 py-2 font-mono text-slate-200">{vel.toFixed(1)} m/s</td>
                      <td className="border-b border-slate-800/60 py-2">
                        <div className="text-[11px] text-slate-300">{intent.label}</div>
                        <div className="mt-1 h-1.5 w-full max-w-[130px] rounded-full bg-slate-800">
                          <div className="h-1.5 rounded-full bg-cyanSignal" style={{ width: `${Math.round(intent.p * 100)}%` }} />
                        </div>
                      </td>
                      <td className="border-b border-slate-800/60 py-2 text-right font-mono font-bold text-emerald-300">{conf.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          Each row's top intent is the single highest-probability candidate from that
          object's fan -- the same distribution visualised on the left.
        </p>
      </div>
    </div>
  );
}

// Lead-time distribution bins for the mini bar chart.
const LEAD_TIME_BINS = [
  { key: "<0.5s", max: 0.5, color: "#2dd4bf" },
  { key: "0.5–1.0s", max: 1.0, color: "#22d3ee" },
  { key: "1.0–1.5s", max: 1.5, color: "#38bdf8" },
  { key: "1.5–2.0s", max: 2.0, color: "#fbbf24" },
  { key: ">2.0s", max: Infinity, color: "#64748b" },
];

function binLeadTimes(events) {
  const counts = LEAD_TIME_BINS.map(() => 0);
  for (const e of events) {
    const t = e.lead_time_seconds;
    let idx = LEAD_TIME_BINS.findIndex((b) => t < b.max);
    if (idx === -1) idx = LEAD_TIME_BINS.length - 1;
    counts[idx] += 1;
  }
  return counts;
}

// A 12-dot recovery timeline: deviation (red) -> recovered (green) -> remaining
// timeline (slate). Red count scales with how many frames it took to recover.
function RecoveryTimeline({ frames }) {
  const total = 12;
  const red = clamp(frames, 1, 5);
  const green = 3;
  const gray = Math.max(0, total - red - green);
  const dots = [
    ...Array(red).fill("#f43f5e"),
    ...Array(green).fill("#34d399"),
    ...Array(gray).fill("#334155"),
  ];
  return (
    <div className="flex items-center gap-1">
      {dots.map((c, i) => (
        <span key={i} className="h-2 w-2 rounded-full" style={{ background: c }} />
      ))}
    </div>
  );
}

// D3 (lead-time-to-arrival) + D4 (prediction failure/recovery) -- both
// measured for real, frame by frame, in evaluation/prediction_lead_time.py
// and evaluation/prediction_recovery.py, and accumulated automatically as
// /api/frame runs elsewhere in the app. This panel reads the running log via
// GET /api/demo/prediction_timing, and when that log is still empty it falls
// back to values derived from the backend's live dynamic regions.
function PredictionTimingPanel({ isLive }) {
  const [data, setData] = useState(null);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isLive) {
      setData(simPredictionTiming(0));
      setState(null);
      setError(null);
      const i = window.setInterval(() => setTick((t) => {
        const n = t + 1;
        setData(simPredictionTiming(n));
        return n;
      }), 2000);
      return () => window.clearInterval(i);
    }
    let cancelled = false;
    const poll = () => {
      Promise.all([getPredictionTiming().catch(() => null), getState().catch(() => null)])
        .then(([timing, st]) => {
          if (cancelled) return;
          if (!timing && !st) { setError("prediction timing unavailable"); return; }
          setData(timing);
          setState(st);
          setError(null);
        });
    };
    poll();
    const interval = window.setInterval(poll, 2000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [isLive]);

  if (error) {
    return (
      <div className="mt-4 panel">
        <div className="section-title"><ScanLine size={15} /> D3/D4 · Measured Prediction Timing</div>
        <p className="mt-3 text-sm text-rose-400">Backend unreachable: {error}</p>
      </div>
    );
  }

  // Prefer the backend's real measured events; fall back to region-derived
  // timing only when the live log is still empty.
  const derived = isLive ? deriveTimingFromState(state) : null;
  const leadTime = data?.lead_time?.events?.length ? data.lead_time : (derived?.lead_time ?? data?.lead_time);
  const recovery = data?.recovery?.events?.length ? data.recovery : (derived?.recovery ?? data?.recovery);

  const events = leadTime?.events ?? [];
  const counts = binLeadTimes(events);
  const maxCount = Math.max(1, ...counts);
  const recoveryEvents = recovery?.events ?? [];

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      {/* --- Lead time --- */}
      <div className="panel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="section-title mb-0"><Clock size={15} /> D3 · Prediction Lead Time</div>
          <span className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1.5 text-right">
            <span className="block text-[9px] font-black uppercase tracking-wider text-emerald-300/70">Avg lead time</span>
            <span className="block font-mono text-sm font-black text-emerald-300">
              {leadTime?.average_lead_time_seconds == null ? "—" : `${leadTime.average_lead_time_seconds.toFixed(2)}s`}
            </span>
          </span>
        </div>

        <div className="mt-2 text-[11px] text-slate-400">
          Measured events: <span className="font-mono font-bold text-cyan-200">{leadTime?.measured_event_count ?? 0}</span>
        </div>

        {events.length ? (
          <table className="mt-3 w-full border-collapse text-xs">
            <thead>
              <tr>
                {["Track", "Region", "Predicted", "Arrival", "Lead time"].map((h) => (
                  <th className="border-b border-line pb-1.5 text-left uppercase tracking-wide text-[10px] text-slate-500" key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.slice(0, 8).map((e, i) => (
                <tr key={`${e.track_id}-${e.region_id}-${i}`}>
                  <td className="border-b border-slate-800/60 py-1 font-mono text-slate-300">{e.track_id}</td>
                  <td className="border-b border-slate-800/60 py-1 font-mono text-slate-300">{e.region_id}</td>
                  <td className="border-b border-slate-800/60 py-1 font-mono text-slate-100">{e.predicted_frame}</td>
                  <td className="border-b border-slate-800/60 py-1 font-mono text-slate-100">{e.arrival_frame}</td>
                  <td className="border-b border-slate-800/60 py-1 font-mono font-bold text-emerald-300">{e.lead_time_seconds.toFixed(2)}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No arrival matched to a prior prediction yet -- keep advancing frames.</p>
        )}

        {/* distribution mini-chart */}
        {events.length > 0 && (
          <div className="mt-4 rounded-lg border border-line bg-black/20 p-3">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Lead time distribution</div>
            <div className="mt-3 flex h-24 items-end gap-2">
              {LEAD_TIME_BINS.map((b, i) => {
                const h = (counts[i] / maxCount) * 100;
                return (
                  <div key={b.key} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[9px] font-mono text-slate-400">{counts[i] || ""}</span>
                    <div className="flex w-full flex-1 items-end">
                      <div className="w-full rounded-t" style={{ height: `${h}%`, minHeight: counts[i] ? 6 : 0, background: b.color }} />
                    </div>
                    <span className="text-[8px] text-slate-500">{b.key}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* --- Failure & recovery --- */}
      <div className="panel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="section-title mb-0"><RotateCcw size={15} /> D4 · Prediction Failure & Recovery</div>
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-300">
            {recovery?.open_watch_count ?? 0} Track{(recovery?.open_watch_count ?? 0) === 1 ? "" : "s"}
          </span>
        </div>

        {recoveryEvents.length ? (
          <div className="mt-3 space-y-2.5">
            {recoveryEvents.slice(0, 5).map((e, i) => (
              <div className="rounded-lg border border-line bg-black/20 p-3" key={`${e.track_id}-${e.resolved_frame}-${i}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white">{e.track_id}</div>
                    <div className="mt-1 text-[11px] text-slate-400">Old region <span className="font-mono text-slate-300">{e.old_region_id}</span></div>
                    <div className="text-[11px] text-slate-400">→ New region <span className="font-mono text-slate-300">{e.new_region_id}</span></div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-[11px] text-slate-400">{e.frames_to_recover} frame(s)</div>
                    <div className="mt-1 font-mono text-xs">
                      <span className="text-rose-300">{e.old_region_utility_before.toFixed(2)}</span>
                      <span className="text-slate-600"> → </span>
                      <span className="text-emerald-300">{e.old_region_utility_after.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <RecoveryTimeline frames={e.frames_to_recover} />
                  <span className="shrink-0 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-300">Recovered</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No trajectory changes with a resolved region hand-off yet.</p>
        )}

        {/* legend */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-slate-400">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500" />Higher error (deviation)</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" />Recovered &amp; stable</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-600" />Track timeline</span>
        </div>
      </div>
    </div>
  );
}

// A2: Prediction-Error Recovery -- real tracked objects' own measured
// prediction error, straight from tracking/tracker.py via
// api/liveAdapter.js's `predictionError` field. Deliberately separate from
// the scripted synthetic walkthrough above (SimulationView/ObjectPanel/etc,
// which stays untouched as its own fixed teaching narrative). When the
// adapter surfaces no discrete dynamic tracks (this dataset's tracker returns
// none), it falls back to the backend's live dynamic regions so real
// per-region uncertainty still drives the recovery state.
const RECOVERING_THRESHOLD_M = 0.3; // matches tracker.py's expected_step normalization scale roughly

// A labelled 0-1 bar used inside each live-tracking card.
function MiniBar({ label, value, max = 1, unit, colorClass }) {
  const pct = clamp((value / max) * 100, 0, 100);
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
        <span>{label}</span>
        <span className="font-mono text-slate-200">{value.toFixed(2)}{unit ? ` ${unit}` : ""}</span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-slate-900">
        <div className={`h-1.5 rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function LivePredictionErrorPanel({ isLive, regions }) {
  const [tick, setTick] = useState(0);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isLive) {
      setState(null);
      setError(null);
      const i = window.setInterval(() => setTick((t) => t + 1), 900);
      return () => window.clearInterval(i);
    }
    let cancelled = false;
    const poll = () => {
      getState()
        .then((payload) => { if (!cancelled) { setState(payload); setError(null); } })
        .catch((err) => { if (!cancelled) setError(err.message); });
    };
    poll();
    const interval = window.setInterval(poll, 500);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [isLive]);

  // Live: use the adapter's dynamic regions when present (real discrete
  // tracks); otherwise derive tracks from the backend's dynamic-class regions.
  const adapted = (regions ?? []).filter((r) => r.kind === "dynamic" && Number.isFinite(r.predictionError));
  const tracked = !isLive
    ? simPredictionError(tick)
    : adapted.length
      ? adapted
      : liveDynamicRegions(state);

  const recoveringCount = tracked.filter((r) => r.predictionError > RECOVERING_THRESHOLD_M).length;

  return (
    <div className="mt-4 panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="section-title mb-0"><Route size={15} /> Live Tracking · Prediction-Error Recovery</div>
        {tracked.length > 0 && (
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider">
            <span className="rounded-full border border-line bg-black/30 px-2.5 py-1 text-slate-300">{tracked.length} tracked</span>
            <span className={`rounded-full px-2.5 py-1 ${recoveringCount ? "border border-amber-400/30 bg-amber-400/10 text-amber-300" : "border border-emerald-400/30 bg-emerald-400/10 text-emerald-300"}`}>
              {recoveringCount} recovering
            </span>
          </div>
        )}
      </div>

      {error ? (
        <p className="mt-3 text-sm text-rose-400">Backend unreachable: {error}</p>
      ) : tracked.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No tracked dynamic objects in the current frame.</p>
      ) : (
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {tracked.map((r) => {
            const recovering = r.predictionError > RECOVERING_THRESHOLD_M;
            return (
              <div
                className={`rounded-lg border bg-black/20 p-3 ${recovering ? "border-amber-400/30" : "border-line"}`}
                key={r.id}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md border border-fuchsia-400/30 bg-fuchsia-500/10">
                      <ClassIcon cls={r.class} className="text-fuchsia-300" size={16} />
                    </span>
                    <span className="text-sm font-bold text-white">{r.name}</span>
                  </div>
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${recovering ? "animate-pulse bg-amber-400" : "bg-emerald-400"}`} />
                </div>

                <div className="mt-3 space-y-2.5">
                  <MiniBar label="Prediction error" value={r.predictionError} max={1} unit="m" colorClass={recovering ? "bg-amber-400" : "bg-emerald-400"} />
                  <MiniBar label="Track uncertainty" value={r.uncertainty} max={1} colorClass="bg-sky-400" />
                </div>

                <div
                  className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                    recovering ? "bg-amber-400/15 text-amber-300" : "bg-emerald-400/15 text-emerald-300"
                  }`}
                >
                  {recovering ? <RotateCcw size={11} /> : <CheckCircle2 size={11} />}
                  {recovering ? "Recovering from trajectory change" : "Stable tracking"}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        Each track compares its own last one-step-ahead forecast against where the object
        actually showed up this frame. A real deviation (e.g. the object turns) spikes
        uncertainty immediately; steady, predictable motion decays it back down over a few
        frames -- see tracking/tracker.py.
      </p>
    </div>
  );
}

// "What the demo proves" -- five stage cards with circular numbered badges and
// an icon per stage, matching the reference footer strip.
const DEMO_STEPS = [
  { n: "1", title: "Perceive", text: "Classify terrain, static objects and dynamic actors.", icon: Layers3 },
  { n: "2", title: "Predict", text: "Estimate where relevant objects will be next.", icon: Clock },
  { n: "3", title: "Prioritize", text: "Compare information gain against refinement cost.", icon: Target },
  { n: "4", title: "Adapt Resolution", text: "Refine only critical regions and reclaim the rest.", icon: Settings2 },
  { n: "5", title: "Safe Corridors", text: "Route around anything the map now flags as blocked.", icon: ShieldCheck },
];

function WhatTheDemoProves() {
  return (
    <div className="mt-4 panel">
      <div className="section-title"><GitBranch size={15} /> What the demo proves</div>
      <div className="mt-3 grid gap-3 md:grid-cols-5">
        {DEMO_STEPS.map(({ n, title, text, icon: Icon }) => (
          <div key={n} className="rounded-lg border border-line bg-black/20 p-3 transition hover:border-cyanSignal/40">
            <div className="flex items-center justify-between">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-cyanSignal/40 bg-cyanSignal/10 text-sm font-black text-cyanSignal">{n}</span>
              <Icon className="text-cyanSignal/70" size={18} />
            </div>
            <div className="mt-3 text-sm font-bold text-white">{title}</div>
            <div className="mt-1 text-[11px] leading-relaxed text-slate-500">{text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SmallCard({ icon: Icon, title, value, note }) {
  return <div className="panel"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500"><Icon size={14} /> {title}</div><div className="mt-2 text-xl font-black text-white">{value}</div><div className="mt-1 text-[10px] text-slate-500">{note}</div></div>;
}