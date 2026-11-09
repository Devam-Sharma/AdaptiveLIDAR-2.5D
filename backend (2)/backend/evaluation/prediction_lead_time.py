"""D3: Prediction Before Arrival -- lead-time measurement.

The doc asks the prototype to "measure or at least record the timing
relationship between predicted relevance and subsequent object arrival."
This module does that for real, frame by frame:

  1. Each frame, scan the map's active regions for any whose
     future_probability has crossed a threshold (region became a
     probable future location for some track) -- attribute that region to
     whichever track's future-occupancy candidate (see
     prediction/future_occupancy.py) is nearest it, the same signal that
     raised the region's probability in the first place.
  2. Remember the frame that FIRST happened for that (track, region)
     pair -- this is the "prediction" event.
  3. On every later frame, check whether that same track's real,
     currently-tracked position has actually arrived at that region. When
     it has, close the event and record the elapsed frame gap -- the
     "arrival" event and the measured lead time.

Every number is a real elapsed-frame count between two things that
actually happened in the simulation; nothing here is simulated ahead of
time or asserted as a fixed constant.
"""
import math
from collections import deque


class PredictionLeadTimeTracker:
    def __init__(self, config, relevance_threshold=0.5, arrival_radius_factor=1.0, max_log=25):
        self.config = config
        self.relevance_threshold = relevance_threshold
        self.arrival_radius_factor = arrival_radius_factor
        self.max_log = max_log
        self._pending = {}  # (track_id, region_id) -> pending prediction dict
        self.log = deque(maxlen=max_log)

    def reset(self):
        self._pending.clear()
        self.log.clear()

    def _nearest_track_for(self, region, future):
        best_track, best_d = None, None
        for f in future:
            d = math.hypot(region.x - f["x"], region.y - f["y"])
            if best_d is None or d < best_d:
                best_d, best_track = d, f["track_id"]
        return best_track

    def update(self, tracks, active_regions, future, frame_id):
        if not future:
            return
        tracks_by_id = {t["track_id"]: t for t in tracks}

        # 1-2: notice newly-probable regions and open a pending prediction.
        for region in active_regions:
            if region.future_probability < self.relevance_threshold:
                continue
            track_id = self._nearest_track_for(region, future)
            if track_id is None:
                continue
            key = (track_id, region.region_id)
            if key not in self._pending:
                self._pending[key] = {
                    "track_id": track_id,
                    "region_id": region.region_id,
                    "region_x": region.x, "region_y": region.y,
                    "predicted_frame": frame_id,
                    "arrival_radius": max(region.size, 0.5) * self.arrival_radius_factor,
                }

        # 3: check every pending prediction for real arrival.
        resolved = []
        for key, pend in self._pending.items():
            tr = tracks_by_id.get(pend["track_id"])
            if tr is None:
                continue
            d = math.hypot(tr["x"] - pend["region_x"], tr["y"] - pend["region_y"])
            if d <= pend["arrival_radius"]:
                lead_frames = frame_id - pend["predicted_frame"]
                self.log.appendleft({
                    **pend,
                    "arrival_frame": frame_id,
                    "lead_time_frames": lead_frames,
                    "lead_time_seconds": round(lead_frames * self.config.simulation_dt, 3),
                })
                resolved.append(key)
        for key in resolved:
            del self._pending[key]

    def summary(self):
        events = list(self.log)
        measured = [e for e in events if e["lead_time_frames"] > 0]
        avg_lead = (
            sum(e["lead_time_seconds"] for e in measured) / len(measured)
            if measured else None
        )
        return {
            "events": events,
            "pending_count": len(self._pending),
            "measured_event_count": len(measured),
            "average_lead_time_seconds": avg_lead,
            "note": (
                "Each event is a real (predicted-relevance frame, actual-"
                "arrival frame) pair for one tracked object and the region "
                "its own future-occupancy candidate pointed to -- lead time "
                "= arrival_frame - predicted_frame, in both frames and "
                "seconds (using config.simulation_dt)."
            ),
        }