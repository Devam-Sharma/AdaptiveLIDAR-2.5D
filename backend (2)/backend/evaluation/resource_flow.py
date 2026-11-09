"""D6: "Follow the Information" -- resource flow ledger.

Every COARSEN in mapping/map_manager.py's apply_decisions() releases
budget (negative `allocated_cost`); every REFINE consumes it (positive
`allocated_cost`). This module keeps a running, bounded ledger of both
kinds of event exactly as apply_decisions() reports them, plus a simple
FIFO "unclaimed pool" of released-but-not-yet-reused budget -- so it can
pair an OLDER release with a LATER consumption that actually drew it
down, in the order it really happened.

This is real cross-frame bookkeeping, not a scripted animation: a
"pairing" only appears once the ledger balance genuinely covered it. It
does not change what gets refined or coarsened -- BudgetManager.allocate()
already decided that; this only narrates where the freed budget actually
went afterward.
"""
from collections import deque


class ResourceFlowLedger:
    def __init__(self, max_log=40):
        self.max_log = max_log
        self.events = deque(maxlen=max_log)
        self.pairings = deque(maxlen=max_log)
        self._pool = 0.0
        self._pool_sources = deque()

    def reset(self):
        self.events.clear()
        self.pairings.clear()
        self._pool = 0.0
        self._pool_sources.clear()

    def record(self, applied, nodes_by_id, frame_id):
        """`applied` is map_manager.apply_decisions()'s return value for
        THIS frame. `nodes_by_id` is map.tree.nodes (ALL cells, active or
        not -- a REFINE deactivates its parent, so an active-only lookup
        would miss it right when we need its x/y)."""
        for d in applied:
            region = nodes_by_id.get(d["region_id"])
            amount = abs(d.get("allocated_cost", 0.0))
            event = {
                "frame_id": frame_id,
                "region_id": d["region_id"],
                "x": getattr(region, "x", None), "y": getattr(region, "y", None),
                "semantic_class": getattr(region, "semantic_class", None),
                "action": d["action"],
                "amount": round(amount, 4),
                "utility": d.get("utility"),
            }
            self.events.appendleft(event)

            if d["action"] == "COARSEN":
                self._pool += amount
                self._pool_sources.append(dict(event, amount_remaining=amount))
            elif d["action"] == "REFINE" and amount > 1e-9:
                remaining_needed = amount
                funded_by = []
                while remaining_needed > 1e-9 and self._pool_sources:
                    src = self._pool_sources[0]
                    take = min(src["amount_remaining"], remaining_needed)
                    src["amount_remaining"] -= take
                    remaining_needed -= take
                    funded_by.append({
                        "region_id": src["region_id"], "x": src["x"], "y": src["y"],
                        "frame_id": src["frame_id"], "amount": round(take, 4),
                    })
                    if src["amount_remaining"] <= 1e-9:
                        self._pool_sources.popleft()
                self._pool = max(0.0, self._pool - (amount - remaining_needed))
                if funded_by:
                    self.pairings.appendleft({
                        "refine_region_id": d["region_id"],
                        "refine_x": event["x"], "refine_y": event["y"],
                        "refine_semantic_class": event["semantic_class"],
                        "refine_frame_id": frame_id,
                        "refine_amount": round(amount, 4),
                        "funded_by": funded_by,
                        "unfunded_amount": round(remaining_needed, 4),
                    })

    def summary(self):
        return {
            "events": list(self.events),
            "pairings": list(self.pairings),
            "unclaimed_pool": round(self._pool, 4),
            "note": (
                "Every COARSEN's freed budget enters a FIFO pool; every "
                "REFINE draws down that same pool in the order releases "
                "actually happened. A pairing only appears once the ledger "
                "balance genuinely covered it -- the budget follows the "
                "information across frames, it isn't asserted."
            ),
        }