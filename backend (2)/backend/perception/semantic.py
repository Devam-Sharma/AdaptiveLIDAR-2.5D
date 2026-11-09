import math
import numpy as np

SEMANTIC_SCORE = {
    "pedestrian": 1.0, "vehicle": 0.9, "curb": 0.75,
    "obstacle": 0.85, "road": 0.25, "building": 0.35,
    "terrain": 0.20, "unknown": 0.45,
}

def perceive(points, detections, config):
    regions = []

    # Use supplied detections/labels when available.
    for d in detections or []:
        cls = d.get("class", d.get("label", "unknown"))
        x, y = float(d["x"]), float(d["y"])
        vx, vy = float(d.get("vx", 0)), float(d.get("vy", 0))
        dist = math.hypot(x, y)
        regions.append({
            "x": x, "y": y, "z": float(d.get("z", 0)),
            "semantic_class": cls,
            "semantic_importance": SEMANTIC_SCORE.get(cls, .45),
            "motion": min(1, math.hypot(vx, vy)/3),
            "uncertainty": max(.05, 1-float(d.get("confidence", .8))),
            "geometry": float(d.get("geometry", .55)),
            "distance_relevance": 1/(1+dist/10),
            "occupancy": .95,
            "confidence": float(d.get("confidence", .8))
        })

    # If there are no detections, create lightweight spatial observations from the
    # point cloud. This keeps the adaptive mapping engine usable on raw LiDAR.
    if not regions and len(points):
        res = config.resolution_levels[0]
        xy = np.asarray(points)[:, :2]
        keys = {}
        for x, y in xy:
            k = (int(np.floor((x+config.map_dimensions[0]/2)/res)),
                 int(np.floor((y+config.map_dimensions[1]/2)/res)))
            keys.setdefault(k, []).append((x,y))
        for k, vals in list(keys.items())[:1200]:
            arr = np.asarray(vals)
            x, y = arr.mean(axis=0)
            dist = math.hypot(x,y)
            density = min(1, len(vals)/30)
            regions.append({
                "x": float(x), "y": float(y), "z": 0,
                "semantic_class": "unknown",
                "semantic_importance": .45,
                "motion": 0,
                "uncertainty": .75,
                "geometry": density,
                "distance_relevance": 1/(1+dist/10),
                "occupancy": density,
                "confidence": .25
            })

    return {
        "regions": regions,
        "dynamic_objects": [
            d for d in (detections or [])
            if d.get("class", d.get("label", "unknown")) in ("pedestrian", "vehicle")
        ]
    }
