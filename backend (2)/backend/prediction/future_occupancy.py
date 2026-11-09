import math

class FuturePredictor:
    """Lightweight future-occupancy prediction.

    D3 (Prediction Before Arrival) requires that the future-occupancy
    signal be "distributed over multiple possible future regions rather
    than one deterministic point" -- so a track's forecast is no longer a
    single (x, y), it's a small probability-weighted FAN of candidate
    positions at the same horizon: straight-ahead (the old behavior) plus
    a left- and right-deviation candidate. Each track's own measured
    uncertainty (tracking/tracker.py's A2 prediction-error signal) both
    widens the fan and shifts probability mass off the straight-line
    candidate onto the side candidates -- a track that just went through a
    trajectory change is modeled as genuinely less predictable, not just
    displayed that way.

    This is still ONE lightweight linear-extrapolation model per candidate
    (no second complete future map, no physics simulation) -- just three
    samples of it instead of one. mapping/map_manager.py's
    update_future_signal consumes the output exactly as before (x, y,
    sigma) plus a new `probability` weight; a stationary/near-stationary
    track collapses back to the original single-point, probability=1.0
    behavior automatically.
    """

    # Angular offset (radians) of the side candidates from the
    # straight-line heading, and the base share of a track's probability
    # mass assigned to each candidate before uncertainty reweights them.
    SIDE_ANGLE_RAD = math.radians(25)
    BASE_STRAIGHT_WEIGHT = 0.6

    def __init__(self, config):
        self.config = config

    def predict(self, tracks, horizon):
        result = []
        for tr in tracks:
            speed = math.hypot(tr["vx"], tr["vy"])
            uncertainty = tr.get("uncertainty", 0.2)
            sigma = self.config.prediction_sigma + uncertainty * horizon

            if speed < 1e-6:
                # Not moving (or not yet moving): nothing to fan out in a
                # direction, a single candidate at its current position.
                result.append({
                    "track_id": tr["track_id"], "class": tr["class"],
                    "candidate": "straight",
                    "x0": tr["x"], "y0": tr["y"],
                    "x": tr["x"], "y": tr["y"],
                    "sigma": sigma, "speed": speed, "horizon": horizon,
                    "probability": 1.0,
                })
                continue

            heading = math.atan2(tr["vy"], tr["vx"])
            # More track uncertainty -> straight-line candidate is trusted
            # less (more mass pushed onto the side candidates) and the
            # side candidates spread wider apart.
            spread = self.SIDE_ANGLE_RAD * (1.0 + uncertainty)
            w_straight = self.BASE_STRAIGHT_WEIGHT * (1.0 - 0.5 * uncertainty)
            w_side = (1.0 - w_straight) / 2.0

            for name, angle_offset, weight in (
                ("straight", 0.0, w_straight),
                ("left", spread, w_side),
                ("right", -spread, w_side),
            ):
                theta = heading + angle_offset
                x = tr["x"] + math.cos(theta) * speed * horizon
                y = tr["y"] + math.sin(theta) * speed * horizon
                result.append({
                    "track_id": tr["track_id"], "class": tr["class"],
                    "candidate": name,
                    "x0": tr["x"], "y0": tr["y"],
                    "x": x, "y": y,
                    "sigma": sigma, "speed": speed, "horizon": horizon,
                    "probability": round(weight, 4),
                })
        return result