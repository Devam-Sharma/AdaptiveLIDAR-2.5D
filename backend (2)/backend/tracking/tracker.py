import math

class Tracker:
    # A2: Prediction-error recovery. Baseline/ceiling for a track's
    # uncertainty -- how confident we are in its predicted future position,
    # not its current detected position (that's the cell-level uncertainty
    # from perception, a separate signal). BASE is what a freshly-confirmed,
    # accurately-tracked object settles at; MAX is the ceiling a sudden
    # trajectory change can push it toward.
    BASE_UNCERTAINTY = 0.20
    MAX_UNCERTAINTY = 0.95

    def __init__(self, config):
        self.config = config
        self.tracks = {}

    def update(self, detections):
        out = []
        dt = self.config.simulation_dt
        for d in detections:
            tid = d["track_id"]
            old = self.tracks.get(tid)
            if old:
                vx = 0.7 * old["vx"] + 0.3 * d["vx"]
                vy = 0.7 * old["vy"] + 0.3 * d["vy"]
                # `old["predicted_x"/"predicted_y"]` was this same track's
                # own one-step-ahead forecast, computed at the end of the
                # PREVIOUS update() call using the velocity known back then.
                # Comparing it against where the object actually showed up
                # this frame is a real, measured prediction error -- not a
                # constant. A sudden trajectory change (e.g. the object
                # turns) shows up here as a genuine spike.
                error = math.hypot(d["x"] - old["predicted_x"], d["y"] - old["predicted_y"])
                # Normalized against the step the object itself was
                # expected to take, so a fast mover isn't flagged just for
                # covering more ground -- only an actual deviation from ITS
                # OWN expected path counts.
                expected_step = max(0.05, math.hypot(old["vx"], old["vy"]) * dt)
                deviation = min(1.0, error / expected_step)
                raw_uncertainty = self.BASE_UNCERTAINTY + deviation * (self.MAX_UNCERTAINTY - self.BASE_UNCERTAINTY)
                # EMA smoothing: one noisy frame doesn't fully swing
                # confidence, but a sustained trajectory change does, and a
                # track that goes back to being predictable recovers back
                # toward BASE_UNCERTAINTY on its own over a few frames --
                # the same confirm/decay shape as A1's stability streak.
                uncertainty = 0.4 * old["uncertainty"] + 0.6 * raw_uncertainty
            else:
                vx, vy = d["vx"], d["vy"]
                error = 0.0
                uncertainty = self.BASE_UNCERTAINTY

            track = {
                "track_id": tid, "class": d["class"],
                "x": d["x"], "y": d["y"], "vx": vx, "vy": vy,
                "direction": math.atan2(vy, vx) if abs(vx)+abs(vy) > 1e-9 else 0.0,
                "uncertainty": uncertainty,
                # Exposed for the A4 explainability panel and A2 demo --
                # "how wrong was our last forecast for this exact object".
                "prediction_error": round(error, 4),
                # This frame's own one-step-ahead forecast, saved so NEXT
                # frame's update() can measure its error the same way.
                "predicted_x": d["x"] + vx * dt,
                "predicted_y": d["y"] + vy * dt,
            }
            self.tracks[tid] = track
            out.append(track)
        return out