class MetricsEvaluator:
    def __init__(self, config):
        self.config = config
        self.history = []

    def record(self, metrics):
        self.history.append(metrics)

    def summary(self):
        if not self.history:
            return {"frames": 0}
        n = len(self.history)
        return {
            "frames": n,
            "avg_processing_time_ms": sum(x["processing_time_ms"] for x in self.history)/n,
            "avg_fps": sum(x["fps"] for x in self.history)/n,
            "avg_active_cells": sum(x["active_cells"] for x in self.history)/n,
        }
