# Adaptive Variable-Resolution 2.5D LiDAR — FastAPI + Dataset Backend

## Run

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

Open:
- API: http://localhost:8000
- Swagger: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Dataset support

The loader accepts:
- `.bin` — automatically detects N×3 or N×4 float32 layout
- `.npy` — N×3/N×4
- `.npz` — uses `points` key if present, otherwise first array
- `.csv` / `.txt`
- `.pcd` / `.ply` with optional Open3D
- `.zip` containing any supported files
- directories containing supported frame files

Optional sidecar annotations can be placed beside a frame:

`000123.bin` + `000123.json`

Example JSON:
```json
{
  "objects": [
    {
      "track_id": "ped-1",
      "class": "pedestrian",
      "x": 3.2,
      "y": 1.4,
      "vx": 0.8,
      "vy": 0.1,
      "confidence": 0.95
    }
  ]
}
```

If there are no detections, the backend creates lightweight spatial observations
from the raw point cloud. The perception interface remains replaceable.

## API

- `GET /api/state`
- `POST /api/frame`
- `POST /api/reset`
- `POST /api/config`
- `GET /api/decisions`
- `GET /api/metrics`
- `GET /api/baseline`
- `GET /api/dataset`
- `POST /api/dataset/path`
- `POST /api/dataset/upload`

### Set a local dataset

```bash
curl -X POST http://localhost:8000/api/dataset/path ^
  -H "Content-Type: application/json" ^
  -d "{\"path\":\"C:/datasets/my_lidar_sequence\"}"
```

Then:

```bash
curl -X POST http://localhost:8000/api/frame
```

### Upload a ZIP

Use Swagger `/docs`, choose `POST /api/dataset/upload`, select the ZIP,
then call `POST /api/frame`.

## Solution logic retained

LiDAR → preprocessing → current perception → persistent hierarchical 2.5D map
→ tracking → future prediction → lightweight future probability
→ current/future information value → expected information gain
→ refinement cost → utility → finite budget → REFINE/MAINTAIN/COARSEN
→ resource reclamation/reallocation → decision trace.

Distance is only one signal and is not the final resolution rule.
