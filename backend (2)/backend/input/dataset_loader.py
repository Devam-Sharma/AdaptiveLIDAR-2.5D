from pathlib import Path
import json, zipfile, tempfile, shutil
import numpy as np

class DatasetLoader:
    def __init__(self, config):
        self.config = config
        self.source = None
        self.files = []
        self.index = 0
        self.extracted_dir = None

    def load_path(self, path):
        p = Path(path).expanduser()
        if not p.exists():
            raise FileNotFoundError(f"Dataset path does not exist: {p}")

        if p.is_file() and p.suffix.lower() == ".zip":
            self.extracted_dir = Path(tempfile.mkdtemp(prefix="adaptive_lidar_dataset_"))
            with zipfile.ZipFile(p, "r") as z:
                z.extractall(self.extracted_dir)
            self.source = self.extracted_dir
        else:
            self.source = p

        self.files = self._discover(self.source)
        self.index = 0
        if not self.files:
            raise ValueError(
                "No supported LiDAR files found. Supported: .bin, .npy, .npz, .pcd, .ply, .csv, .txt"
            )

    def _discover(self, source):
        if source.is_file():
            return [source] if self._supported(source) else []
        return sorted([p for p in source.rglob("*") if p.is_file() and self._supported(p)])

    def _supported(self, p):
        return p.suffix.lower() in {".bin", ".npy", ".npz", ".pcd", ".ply", ".csv", ".txt"}

    def reset(self):
        self.index = 0

    def status(self):
        return {
            "loaded": self.source is not None,
            "source": str(self.source) if self.source else None,
            "frames": len(self.files),
            "current_index": self.index,
            "remaining": max(0, len(self.files) - self.index)
        }

    def next_frame(self):
        if not self.files:
            return None
        if self.index >= len(self.files):
            self.index = 0  # loop for dashboard/demo
        path = self.files[self.index]
        frame_id = self.index
        self.index += 1
        points = self._read_points(path)
        objects = self._read_sidecar_objects(path)
        return {
            "points": points,
            "timestamp": float(frame_id) * self.config.simulation_dt,
            "frame_id": frame_id,
            "source_file": str(path),
            "objects": objects,
            "label_path": self._find_kitti_label(path)
        }

    def _find_kitti_label(self, path):
        """SemanticKITTI convention: .../sequences/00/velodyne/000123.bin
        has ground-truth labels at .../sequences/00/labels/000123.label"""
        if path.suffix.lower() != ".bin":
            return None
        if path.parent.name != "velodyne":
            return None
        candidate = path.parent.parent / "labels" / (path.stem + ".label")
        return str(candidate) if candidate.exists() else None

    def _read_points(self, path):
        ext = path.suffix.lower()
        if ext == ".bin":
            arr = np.fromfile(path, dtype=np.float32)
            if arr.size % 4 == 0:
                arr = arr.reshape(-1, 4)
            elif arr.size % 3 == 0:
                arr = arr.reshape(-1, 3)
            else:
                raise ValueError(f"{path}: BIN size is not divisible by 3 or 4.")
            return arr
        if ext == ".npy":
            return self._normalize(np.load(path))
        if ext == ".npz":
            data = np.load(path)
            key = "points" if "points" in data.files else data.files[0]
            return self._normalize(data[key])
        if ext in {".csv", ".txt"}:
            return self._normalize(np.loadtxt(path, delimiter="," if ext == ".csv" else None))
        if ext in {".pcd", ".ply"}:
            try:
                import open3d as o3d
            except ImportError:
                raise ValueError("PCD/PLY requires Open3D. Install it with: pip install open3d")
            cloud = o3d.io.read_point_cloud(str(path))
            return np.asarray(cloud.points, dtype=np.float32)
        raise ValueError(f"Unsupported file: {path}")

    def _normalize(self, arr):
        arr = np.asarray(arr)
        if arr.ndim != 2 or arr.shape[1] not in (3, 4):
            raise ValueError(f"Expected N×3 or N×4 point cloud, got shape {arr.shape}")
        return arr.astype(np.float32)

    def _read_sidecar_objects(self, path):
        # Optional labels/detections:
        # frame.bin -> frame.json
        # frame.npy -> frame.json
        sidecar = path.with_suffix(".json")
        if not sidecar.exists():
            return []
        try:
            data = json.loads(sidecar.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data.get("objects", data.get("detections", []))
            return data
        except Exception:
            return []