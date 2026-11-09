import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Navbar from "./components/Navbar.jsx";
import LiveStatusPanel from "./components/LiveStatusPanel.jsx";
import LiveSystem from "./pages/LiveSystem.jsx";
import Prediction from "./pages/Prediction.jsx";
import BudgetAnalytics from "./pages/BudgetAnalytics.jsx";
import Comparison from "./pages/Comparison.jsx";
import { BASE_REGIONS, DEMO_STEPS, TOTAL_BUDGET } from "./data/simulationData.js";
import { calculateFrame } from "./utils/utilityCalculation.js";
import { advanceFrame, getConfig, getDatasetStatus, resetBackend } from "./api/backendClient.js";
import { adaptBackendFrame } from "./api/liveAdapter.js";

const initialControls = {
  running: true,
  speed: 1,
  showLidar: true,
  showPrediction: true,
  demoActive: false,
  demoStep: 0,
};

// Last-resort defaults, used only if GET /api/config is unreachable. The real
// values are fetched from the backend on entering Live mode -- the UI no longer
// keeps its own authoritative copy of the budget, which used to drift out of
// sync with config.py and silently rescale every per-region figure on screen.
const FALLBACK_CONFIG = { map_dimensions: [40, 30], computational_budget: 5000 };
const LIVE_POLL_MS = 350;
// A raw per-frame utility number can wobble slightly around a threshold from
// one poll to the next, flipping a region's REFINE/MAINTAIN/COARSEN label
// back and forth even though nothing meaningful changed -- exactly the
// "recalculating every frame" flicker. Require the SAME new decision to show
// up this many consecutive polls before it's actually committed and shown;
// until then the previously-committed decision keeps displaying.
const DECISION_HOLD_FRAMES = 3;

// `stateMap` persists across calls (owned by a ref in the component) so each
// region's hold-streak survives from one poll to the next.
function applyDecisionHold(regions, stateMap) {
  return regions.map((region) => {
    const raw = region.decision;
    const prev = stateMap.get(region.id) ?? { committed: raw, pendingDecision: raw, streak: 0 };
    let { committed, pendingDecision, streak } = prev;

    if (raw === committed) {
      pendingDecision = raw;
      streak = 0;
    } else if (raw === pendingDecision) {
      streak += 1;
      if (streak >= DECISION_HOLD_FRAMES) {
        committed = raw;
        streak = 0;
      }
    } else {
      pendingDecision = raw;
      streak = 1;
    }

    stateMap.set(region.id, { committed, pendingDecision, streak });
    // rawDecision is kept for anyone who wants the unfiltered instantaneous
    // value; every existing component reads `decision`, which is now the
    // held/stable one.
    return { ...region, decision: committed, rawDecision: raw };
  });
}
// How many frames of live metrics to keep for the Budget Analytics timeline.
const LIVE_HISTORY_LENGTH = 40;

// Thresholds for classifying a utility score. The simulated and live utility
// scales are genuinely different (the simulation's calculateFrame produces
// ~1.0-2.5; the backend's ig/cost ratio is compared against
// refine_threshold=0.55 / coarsen_threshold=0.25), so a single hardcoded number
// cannot be correct for both. Pages that need to say "high utility" read these.
const SIMULATED_THRESHOLDS = { refine: 1.8, coarsen: 1.08 };

export default function App() {
  const [activePage, setActivePage] = useState("live");
  const [time, setTime] = useState(0);
  const [frameNumber, setFrameNumber] = useState(4128);
  const [selectedRegionId, setSelectedRegionId] = useState("pedestrian");
  const [controls, setControls] = useState(initialControls);
  const [predictionMode, setPredictionMode] = useState("predictive");

  const [dataSource, setDataSource] = useState("simulated"); // "simulated" | "live"
  const [liveRegions, setLiveRegions] = useState([]);
  const [liveMetrics, setLiveMetrics] = useState(null);
  const [liveHistory, setLiveHistory] = useState([]);
  const [liveConfig, setLiveConfig] = useState(null);
  // Total frames in the currently-loaded dataset (e.g. 1000 for the extended
  // KITTI set), so the UI can show "Frame 42 / 1000" instead of a bare
  // counter with no sense of progress or when it loops back to 0.
  const [datasetTotalFrames, setDatasetTotalFrames] = useState(null);
  const [liveError, setLiveError] = useState(null);
  // "idle" | "connecting" | "live" | "empty" | "error"
  const [liveStatus, setLiveStatus] = useState("idle");

  // Read inside the poll so it always sees the freshest config without making
  // the polling effect tear down and restart every time config arrives.
  const liveConfigRef = useRef(null);
  useEffect(() => { liveConfigRef.current = liveConfig; }, [liveConfig]);
  // Per-region hold state for applyDecisionHold; a ref (not state) because
  // it's mutated every poll and should never itself trigger a re-render.
  const decisionHoldRef = useRef(new Map());

  useEffect(() => {
    let animationId;
    let last = performance.now();

    const tick = (now) => {
      const delta = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (controls.running) {
        setTime((current) => current + delta * controls.speed);
        // Only the simulation invents its own frame numbers. In Live mode the
        // authoritative frame id comes from the backend response; letting the
        // animation loop also drive this counter at ~28/s meant it raced ahead
        // and then snapped back on every poll, so the Navbar counter visibly
        // jittered instead of counting real processed frames.
        if (dataSource !== "live") {
          setFrameNumber((current) => current + Math.max(1, Math.round(delta * 28 * controls.speed)));
        }
      }

      animationId = requestAnimationFrame(tick);
    };

    animationId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationId);
  }, [controls.running, controls.speed, dataSource]);

  useEffect(() => {
    if (!controls.demoActive) return;
    const interval = window.setInterval(() => {
      setControls((current) => ({
        ...current,
        running: true,
        showPrediction: true,
        demoStep: (current.demoStep + 1) % DEMO_STEPS.length,
      }));
    }, 1500);

    return () => window.clearInterval(interval);
  }, [controls.demoActive]);

  // Fetch the backend's real config once, on entering Live mode.
  useEffect(() => {
    if (dataSource !== "live") return;
    let cancelled = false;
    setLiveStatus((current) => (current === "live" ? current : "connecting"));

    getConfig()
      .then((payload) => {
        if (!cancelled) setLiveConfig(payload.config ?? payload);
      })
      .catch(() => {
        // Not fatal on its own -- fall back to the defaults and let the frame
        // poll below decide whether the backend is actually reachable.
        if (!cancelled) setLiveConfig(FALLBACK_CONFIG);
      });

    getDatasetStatus()
      .then((payload) => {
        if (!cancelled) setDatasetTotalFrames(payload.frames ?? null);
      })
      .catch(() => {
        // Not fatal -- the frame counter just falls back to showing no total.
        if (!cancelled) setDatasetTotalFrames(null);
      });

    return () => { cancelled = true; };
  }, [dataSource]);

  // Extracted so a manual "Step" click and the auto-poll loop share one
  // implementation instead of drifting apart. Fetches exactly one frame from
  // the backend regardless of controls.running -- that's the point of a
  // manual step control, it has to work while paused. `isStale` lets the
  // auto-poll loop below discard a response that resolved after the effect
  // that started it was torn down (e.g. the user switched back to Simulated
  // mid-request); the manual step button has no such window to guard.
  const fetchLiveFrame = useCallback(async (isStale = () => false) => {
    const result = await advanceFrame();
    if (isStale()) return;
    const { regions: rawRegions, metrics } = adaptBackendFrame(result, liveConfigRef.current ?? FALLBACK_CONFIG);
    const regions = applyDecisionHold(rawRegions, decisionHoldRef.current);
    setLiveRegions(regions);
    setLiveMetrics(metrics);
    setFrameNumber(result.frame_id);
    setLiveError(null);
    setLiveStatus(regions.length ? "live" : "empty");

    if (metrics) {
      setLiveHistory((current) => {
        const next = [...current, {
          label: `${metrics.frame_id}`,
          frameId: metrics.frame_id,
          Fine: metrics.fine_cells ?? 0,
          Medium: metrics.medium_cells ?? 0,
          Coarse: metrics.coarse_cells ?? 0,
          activeCells: metrics.active_cells ?? 0,
          used: Number((metrics.used_budget ?? 0).toFixed(2)),
          budget: metrics.budget ?? 0,
        }];
        return next.slice(-LIVE_HISTORY_LENGTH);
      });
    }
  }, []);

  // Poll the real backend, one frame at a time, while Live is selected.
  //
  // Chained setTimeout rather than setInterval: /api/frame MUTATES server state
  // (it advances the dataset cursor and mutates the quadtree), so overlapping
  // requests on a slow frame consumed dataset frames two at a time and could
  // apply responses out of order. Waiting for each response before scheduling
  // the next makes the frame sequence match what the backend actually processed.
  useEffect(() => {
    if (dataSource !== "live") return;
    let cancelled = false;
    let timer = null;

    const poll = async () => {
      try {
        await fetchLiveFrame(() => cancelled);
      } catch (err) {
        if (cancelled) return;
        setLiveError(err.message);
        // Only escalate to a blocking error state if we never had a good frame.
        // Mid-demo blips shouldn't tear down a working screen.
        setLiveStatus((current) => (current === "live" ? current : "error"));
      } finally {
        // Always fetch once on entry, even while paused, so selecting Live
        // shows real data instead of an indefinite "connecting" state. Only
        // keep polling while the simulation is running.
        if (!cancelled && controls.running) {
          timer = window.setTimeout(poll, LIVE_POLL_MS);
        }
      }
    };

    poll();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [dataSource, controls.running, fetchLiveFrame]);

  // Manual "Step" control (PlaybackCard): advances exactly one frame while
  // paused. In Live mode that means pulling one real frame from the backend;
  // in Simulated mode there's no backend frame to pull, so it nudges the
  // client-side clock forward by the same ~1/28s tick the running animation
  // loop uses, matching one "frame" of the simulated feed.
  const stepOnce = useCallback(() => {
    if (dataSource === "live") {
      fetchLiveFrame().catch((err) => {
        setLiveError(err.message);
        setLiveStatus((current) => (current === "live" ? current : "error"));
      });
    } else {
      setTime((current) => current + 1 / 28);
      setFrameNumber((current) => current + 1);
    }
  }, [dataSource, fetchLiveFrame]);

  // Switching modes invalidates the selection (live ids are `track-<n>` /
  // `r-<i>-<j>`; simulated ids are names like "pedestrian") and any live
  // history collected under different config.
  useEffect(() => {
    setSelectedRegionId(null);
    if (dataSource === "simulated") {
      setLiveStatus("idle");
    } else {
      setLiveHistory([]);
    }
  }, [dataSource]);

  const demoIntensity = controls.demoActive ? Math.min(1, controls.demoStep / 5) : 0;
  const predictionEnabled = controls.showPrediction && predictionMode === "predictive";

  const simulatedRegions = useMemo(
    () => calculateFrame(time, { predictionEnabled, demoIntensity }),
    [time, predictionEnabled, demoIntensity],
  );

  // Live mode shows live data or an explicit status panel -- never a silent
  // swap back to the simulation. Previously an empty live response fell through
  // to simulated regions while the "Live Backend" button stayed highlighted,
  // which meant a dead backend on stage looked exactly like a working one.
  const isLive = dataSource === "live" && liveStatus === "live" && liveRegions.length > 0;
  const regions = isLive ? liveRegions : simulatedRegions;

  const selectedRegion = regions.find((region) => region.id === selectedRegionId) ?? regions[0];
  const totalAllocated = regions.reduce((sum, region) => sum + region.cellsAllocated, 0);
  const fps = isLive && liveMetrics ? Math.round(liveMetrics.fps) : Math.round(58 + Math.sin(time * 1.3) * 4);
  const computeUsage =
    isLive && liveMetrics
      ? Math.round((liveMetrics.used_budget / Math.max(liveMetrics.budget, 1e-6)) * 100)
      : Math.round(78 + (totalAllocated / TOTAL_BUDGET) * 18 + Math.sin(time * 0.8) * 3);

  // The real budget in force, not a hardcoded frontend constant.
  const budgetTotal = isLive && liveMetrics ? liveMetrics.budget : TOTAL_BUDGET;
  const budgetUsed = isLive && liveMetrics ? liveMetrics.used_budget : totalAllocated;
  const thresholds = isLive
    ? {
      refine: liveConfig?.refine_threshold ?? 0.55,
      coarsen: liveConfig?.coarsen_threshold ?? 0.25,
    }
    : SIMULATED_THRESHOLDS;
  const resolutionLevels = isLive ? liveConfig?.resolution_levels : undefined;

  const resetSimulation = useCallback(() => {
    setTime(0);
    setControls((current) => ({ ...current, running: true, demoStep: 0 }));

    if (dataSource === "live") {
      // Reset used to be simulation-only, so in Live mode it left the backend's
      // frame cursor and quadtree exactly where they were -- the map never
      // actually went back to a clean state. /api/reset rebuilds the map,
      // tracker and allocator while keeping the posted config, so the budget
      // does not need re-sending.
      setLiveRegions([]);
      setLiveMetrics(null);
      setLiveHistory([]);
      setLiveStatus("connecting");
      decisionHoldRef.current.clear();
      resetBackend()
        .then(() => setFrameNumber(0))
        .catch((err) => { setLiveError(err.message); setLiveStatus("error"); });
    } else {
      setFrameNumber(4128);
    }
  }, [dataSource]);

  const sharedProps = {
    time,
    frameNumber,
    fps,
    computeUsage,
    regions,
    selectedRegion,
    selectedRegionId,
    setSelectedRegionId,
    controls,
    setControls,
    resetSimulation,
    onStep: stepOnce,
    predictionMode,
    setPredictionMode,
    // Live-awareness. Pages that reach for simulated data by a path other than
    // the `regions` array (Prediction's motion model, Budget Analytics'
    // headline chart) need these to respect Live mode.
    isLive,
    liveMetrics: isLive ? liveMetrics : null,
    liveHistory: isLive ? liveHistory : null,
    budgetTotal,
    budgetUsed,
    thresholds,
    resolutionLevels,
    datasetTotalFrames,
  };

  const showLiveGate = dataSource === "live" && !isLive;
  // "42 / 1000", or just "42" if the dataset's total isn't known yet.
  const frameLabel = isLive && datasetTotalFrames
    ? `${frameNumber} / ${datasetTotalFrames}`
    : `${frameNumber}`;

  return (
    <div className="min-h-screen px-4 py-4 lg:px-6">
      <div className="mb-3 flex items-center justify-end gap-2">
        {dataSource === "live" && (
          <span className="mr-auto flex items-center gap-2 text-xs font-bold">
            <span
              className={`h-2 w-2 rounded-full ${liveStatus === "live"
                ? "bg-emerald-400"
                : liveStatus === "error"
                  ? "bg-rose-500"
                  : "bg-amber-400"
                }`}
            />
            <span className={liveStatus === "live" ? "text-emerald-300" : liveStatus === "error" ? "text-rose-400" : "text-amber-300"}>
              {liveStatus === "live"
                ? `LIVE · backend frame ${frameLabel}${datasetTotalFrames && frameNumber >= datasetTotalFrames - 1 ? " · looping back to 0 next" : ""}`
                : liveStatus === "error"
                  ? "LIVE · backend unreachable"
                  : liveStatus === "empty"
                    ? "LIVE · backend responding, no regions"
                    : "LIVE · connecting"}
            </span>
          </span>
        )}
        <button
          type="button"
          className={`control-button ${dataSource === "simulated" ? "control-button-active" : ""}`}
          onClick={() => setDataSource("simulated")}
        >
          Simulated Demo
        </button>
        <button
          type="button"
          className={`control-button ${dataSource === "live" ? "control-button-active" : ""}`}
          onClick={() => setDataSource("live")}
        >
          Live Backend
        </button>
      </div>

      <Navbar
        activePage={activePage}
        computeUsage={computeUsage}
        fps={fps}
        frameNumber={frameNumber}
        datasetTotalFrames={datasetTotalFrames}
        onNavigate={setActivePage}
        dataSource={dataSource}
        liveStatus={liveStatus}
      />

      <main className="pt-4">
        {showLiveGate ? (
          <LiveStatusPanel
            error={liveError}
            onRetry={() => { setLiveStatus("connecting"); setLiveError(null); setDataSource("live"); }}
            onUseSimulated={() => setDataSource("simulated")}
            status={liveStatus}
          />
        ) : (
          <>
            {activePage === "live" && <LiveSystem {...sharedProps} />}
            {activePage === "prediction" && <Prediction {...sharedProps} />}
            {activePage === "budget" && <BudgetAnalytics {...sharedProps} />}
            {activePage === "comparison" && <Comparison {...sharedProps} />}
          </>
        )}
      </main>

      <div className="sr-only">
        Source regions loaded: {isLive ? regions.length : BASE_REGIONS.length}. Utility, budget, resolution and prediction state are{" "}
        {isLive ? "read from the live backend" : "simulated client-side"}.
      </div>
    </div>
  );
}