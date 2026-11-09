from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
import tempfile, os

from config import Config
from input.dataset_loader import DatasetLoader
from mapping.map_manager import MapManager
from tracking.tracker import Tracker
from prediction.future_occupancy import FuturePredictor
from allocation.budget_manager import BudgetManager
from controller import AdaptiveController

app = FastAPI(
    title="Adaptive Variable-Resolution 2.5D LiDAR",
    version="1.0.0",
    description="Utility-driven, predictive, budget-constrained adaptive 2.5D LiDAR mapping backend."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

config = Config()
dataset = DatasetLoader(config)
map_manager = MapManager(config)
tracker = Tracker(config)
predictor = FuturePredictor(config)
allocator = BudgetManager(config)
controller = AdaptiveController(config, map_manager, tracker, predictor, allocator)

state = {"frame_id": 0, "last_result": None}

# --- Startup bootstrap -------------------------------------------------------
# Every object above is a module-level singleton built at import time, so ALL
# dataset state dies with the process. Before this bootstrap existed, a demo
# required two manual POSTs (/api/dataset/path then /api/config) after every
# single restart -- and `reload=True` below means any backend file edit restarts
# the process silently. Forgetting them produced a 404 from /api/frame
# ("No dataset frame available") with a frontend that still showed a green
# "SYSTEM ONLINE" header, i.e. a dead demo that looked alive.
#
# Both steps now happen automatically. Override either with an env var:
#   FOVEAMAP_DATASET=/path/to/sequences/00     (or a .zip, or a velodyne dir)
#   FOVEAMAP_BUDGET=5000
# Failure here is never fatal: we warn and fall back to the old manual flow,
# because a backend that boots and serves /api/config is far easier to debug
# than one that refuses to start.

def _dataset_candidates():
    """Ordered paths to try when FOVEAMAP_DATASET is unset.

    Deliberately narrow -- `DatasetLoader._discover` uses rglob() and treats
    .txt/.csv as point clouds, so pointing at a broad root risks ingesting
    calib.txt or poses.txt as LiDAR frames. A sequence dir is safe: .label
    files are not a supported extension, so only the .bin files are picked up.

    Two sibling dataset roots are scanned, in this order:
      1. <repo>/dataset/sequences/*        -- real, ground-truth-labeled data
         (SemanticKITTI/SemanticPOSS-format: velodyne/*.bin + labels/*.label)
      2. <repo>/FoveaMap_Data/dataset/sequences/*  -- bundled synthetic/demo data
    Root 1 is tried first because a labeled real sequence is strictly more
    useful than the label-free synthetic stress test whenever both are
    present -- bootstrap already warns loudly (see below) if it ever falls
    through to an unlabeled candidate, so this ordering is safe even if
    root 1 is empty or missing.
    """
    repo = Path(__file__).resolve().parent.parent
    roots = [repo / "dataset" / "sequences", repo / "FoveaMap_Data" / "dataset" / "sequences"]
    candidates = []
    for data in roots:
        seqs = sorted(p for p in data.glob("*") if p.is_dir()) if data.is_dir() else []
        candidates += seqs + [s / "velodyne" for s in seqs]
    return candidates


def _bootstrap():
    budget = os.getenv("FOVEAMAP_BUDGET")
    if budget:
        try:
            config.update({"computational_budget": float(budget)})
        except ValueError:
            print(f"[bootstrap] WARNING: FOVEAMAP_BUDGET={budget!r} is not a number; "
                  f"keeping {config.computational_budget}")
    print(f"[bootstrap] computational_budget = {config.computational_budget}")

    override = os.getenv("FOVEAMAP_DATASET")
    candidates = [Path(override).expanduser()] if override else _dataset_candidates()
    if not candidates:
        print("[bootstrap] WARNING: no dataset found automatically. "
              "POST /api/dataset/path before calling /api/frame.")
        return

    for path in candidates:
        try:
            dataset.load_path(str(path))
        except Exception as exc:
            print(f"[bootstrap] skipped {path}: {type(exc).__name__}: {exc}")
            continue
        st = dataset.status()
        labelled = dataset._find_kitti_label(dataset.files[0]) is not None
        print(f"[bootstrap] dataset loaded: {st['frames']} frames from {st['source']} "
              f"(ground-truth labels: {'yes' if labelled else 'NO -- semantics will be degraded'})")
        return

    print("[bootstrap] WARNING: every candidate dataset path failed. "
          "POST /api/dataset/path before calling /api/frame.")


def _preflight_pointnet2():
    """Surface a pointnet2 setup problem at boot, not on the first frame
    someone processes live in front of judges. This is diagnostic only --
    it never changes config.perception_mode itself. controller.process_frame
    falls back to ground_truth/generic automatically per frame regardless of
    what this prints, so a failure here is a heads-up, not a blocker."""
    if getattr(config, "perception_mode", "ground_truth") != "pointnet2":
        return
    try:
        controller._get_pointnet2_perception()
        print("[bootstrap] perception_mode='pointnet2': checkpoint loaded OK.")
    except Exception as exc:
        print(f"[bootstrap] WARNING: perception_mode='pointnet2' is configured but not "
              f"usable ({exc}). /api/frame will automatically fall back to "
              f"ground_truth/generic perception every frame until this is fixed "
              f"(install torch + confirm checkpoints/pointnet2_foveamap.pth is present).")


_bootstrap()
_preflight_pointnet2()
# ---------------------------------------------------------------------------

class ConfigUpdate(BaseModel):
    resolution_levels: list[float] | None = None
    map_dimensions: tuple[float, float] | None = None
    computational_budget: float | None = None
    prediction_horizon: float | None = None
    perception_mode: str | None = None
    wS: float | None = None
    wM: float | None = None
    wU: float | None = None
    wG: float | None = None
    wD: float | None = None
    wP: float | None = None
    refine_threshold: float | None = None
    coarsen_threshold: float | None = None
    max_stale_frames: int | None = None

@app.get("/")
def root():
    return {
        "service": "Adaptive Variable-Resolution 2.5D LiDAR Backend",
        "status": "running",
        "docs": "/docs",
        "dataset": dataset.status()
    }

@app.get("/api/state")
def get_state():
    return controller.serialize_state(state["last_result"])

@app.post("/api/frame")
def next_frame():
    frame = dataset.next_frame()
    if frame is None:
        raise HTTPException(status_code=404, detail="No dataset frame available. Upload/configure a dataset first.")
    state["frame_id"] += 1
    result = controller.process_frame(frame, state["frame_id"])
    state["last_result"] = result
    return result

@app.post("/api/reset")
def reset():
    global dataset, map_manager, tracker, predictor, allocator, controller
    dataset.reset()
    map_manager = MapManager(config)
    tracker = Tracker(config)
    predictor = FuturePredictor(config)
    allocator = BudgetManager(config)
    controller = AdaptiveController(config, map_manager, tracker, predictor, allocator)
    state["frame_id"] = 0
    state["last_result"] = None
    return {"ok": True, "dataset": dataset.status()}

@app.get("/api/config")
def get_config():
    """Read back the live config.

    Previously the only way to see the running config was to POST an empty
    body to /api/config, so the frontend hardcoded its own copy of
    computational_budget and map_dimensions. Those duplicated constants drifted
    out of sync with config.py, which silently rescaled every per-region budget
    figure in the UI. With a real GET the frontend can just ask.
    """
    return {"ok": True, "config": config.to_dict()}

@app.post("/api/config")
def update_config(update: ConfigUpdate):
    data = update.model_dump(exclude_none=True)
    config.update(data)
    controller.refresh_config(config)
    dataset.config = config
    return {"ok": True, "config": config.to_dict()}

@app.get("/api/decisions")
def decisions(limit: int = 200):
    return controller.decision_log[-limit:]

@app.get("/api/dataset")
def dataset_status():
    return dataset.status()

@app.post("/api/dataset/upload")
async def upload_dataset(file: UploadFile = File(...)):
    allowed = {".zip", ".npy", ".npz", ".pcd", ".ply", ".bin", ".csv", ".txt"}
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported dataset format: {suffix}")

    temp_dir = Path(tempfile.gettempdir()) / "adaptive_lidar_uploads"
    temp_dir.mkdir(exist_ok=True)
    target = temp_dir / (Path(file.filename).name)
    target.write_bytes(await file.read())

    try:
        dataset.load_path(str(target))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {"ok": True, "dataset": dataset.status()}

@app.post("/api/dataset/path")
def set_dataset_path(payload: dict):
    path = payload.get("path")
    if not path:
        raise HTTPException(status_code=400, detail="path is required")
    try:
        dataset.load_path(path)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"ok": True, "dataset": dataset.status()}

@app.get("/api/baseline")
def baseline():
    if not state["last_result"]:
        raise HTTPException(status_code=400, detail="Generate a frame first")
    return controller.baseline_compare(state["last_result"])

@app.get("/api/demo/same_distance")
def same_distance_demo(distance: float = 15.0):
    """D1: same-distance, different-resolution demonstration. Runs
    on-demand -- doesn't need a live frame or dataset loaded first, since
    it builds its own two synthetic regions."""
    return controller.same_distance_probe(distance)

@app.get("/api/demo/computational_benefit")
def computational_benefit_demo():
    """D2: measured proposed/uniform/distance-based comparison, accumulated
    across every frame processed since the last reset -- not a single-frame
    snapshot like /api/baseline. Updates automatically every /api/frame
    call; no need to poll this to make it accumulate."""
    return controller.computational_benefit_summary()

@app.post("/api/demo/computational_benefit/reset")
def computational_benefit_reset():
    """Starts a fresh accumulation window for D2's running comparison --
    use this before a controlled judge-facing run so the numbers reflect
    only that run."""
    controller.reset_computational_benefit()
    return {"ok": True}

@app.get("/api/demo/prediction_timing")
def prediction_timing_demo():
    """D3 (lead-time-to-arrival) + D4 (failure/recovery) measured events,
    both accumulated automatically as /api/frame runs."""
    return controller.prediction_timing_summary()

@app.get("/api/demo/why_2_5d")
def why_2_5d_demo():
    """D5: real active-cell accounting vs. a hypothetical dense 3D voxel
    grid at the same (x, y) resolution, computed from whatever regions are
    active in the map right now."""
    return controller.why_2_5d()

@app.get("/api/demo/resource_flow")
def resource_flow_demo():
    """D6 "Follow the Information": real cross-frame ledger of which
    COARSEN's freed budget funded which later REFINE. Updates
    automatically every /api/frame call."""
    return controller.resource_flow_summary()

@app.get("/api/demo/region_decisions")
def region_decisions_demo(position_scale: float = 1.0):
    """D7: five archetypal regions (empty road, building, road edge/
    obstacle, moving vehicle, pedestrian) run through the real allocation
    pipeline, reporting each one's actual derived decision."""
    return controller.region_decision_probe(position_scale=position_scale)

@app.get("/api/demo/controlled_experiment")
def controlled_experiment_demo():
    """D8: consolidated, multi-trial judge-ready report -- repeats D1 and
    D7's probes at several different inputs each and folds in this
    session's own live D2 numbers, so the team has raw, repeatable
    evidence rather than one cherry-picked run."""
    return controller.controlled_experiment()

@app.get("/api/metrics")
def metrics():
    return controller.metrics_summary()

@app.get("/api/model/info")
def model_info():
    """The PointNet++ checkpoint's OWN offline validation numbers (mean_iou,
    accuracy, per-class IoU), extracted from pointnet2_foveamap.pth itself --
    previously captured in code (checkpoint_mean_iou) but never surfaced
    anywhere. Only meaningful once perception_mode='pointnet2' has actually
    loaded the checkpoint at least once; until then there's nothing to report."""
    if getattr(config, "perception_mode", "ground_truth") != "pointnet2":
        return {"ok": False, "detail": "perception_mode is not 'pointnet2'; no checkpoint loaded."}
    try:
        perception = controller._get_pointnet2_perception()
    except RuntimeError as exc:
        return {"ok": False, "detail": str(exc)}
    return {"ok": True, "info": perception.info()}

@app.get("/api/model/accuracy")
def model_accuracy():
    """Live accuracy/mIoU of perception_mode='pointnet2' predictions against
    this repo's own SemanticKITTI ground truth, accumulated frame by frame as
    the demo actually runs -- distinct from /api/model/info's offline number.
    Empty/None fields until at least one pointnet2 frame with ground truth
    has been processed."""
    return controller.accuracy_summary()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True)