import math
from .quadtree import QuadTree

class MapManager:
    def __init__(self, config):
        self.config = config
        self.tree = QuadTree(config)
        self.active_ids = set()
        self.active_cost = 0.0
        self._last_release = 0.0
        self._last_consumption = 0.0

    def update_observations(self, observations, frame_id=None):
        cfg = self.config
        for obs in observations:
            # Route to whichever node currently represents this location --
            # the root if it's still coarse, or the live descendant cell if
            # it's been refined -- instead of always writing into the root.
            cell = self.tree.locate_cell(obs["x"], obs["y"])
            if cell.region_id not in self.active_ids:
                self.active_ids.add(cell.region_id)
                cell.active = True
                cell.active_cost = self.cell_base_cost(cell.resolution)
                self.active_cost += cell.active_cost
            prev_class = cell.semantic_class
            raw_uncertainty = float(obs["uncertainty"]) if "uncertainty" in obs else cell.uncertainty
            # Observation state follows the current persistent region.
            for k in ("z","occupancy","semantic_class","semantic_importance","motion",
                      "uncertainty","geometry","distance_relevance"):
                if k == "z":
                    cell.elevation = obs[k]
                elif k in obs:
                    setattr(cell, k, obs[k])
            # A1: Confidence-aware adaptation. A frame that reconfirms the
            # SAME class with low raw uncertainty extends this cell's
            # stability streak; a class change or a noisy reading resets it.
            # The streak then discounts the uncertainty that
            # information_gain.py actually sees -- so a region that keeps
            # proving itself settled becomes progressively less "worth"
            # refining, and one that just changed looks exactly as
            # uncertain as its raw perception signal says. This is the same
            # aU*uncertainty contributor already in the utility formula, not
            # a new bypass around it.
            confirmed = (
                obs.get("semantic_class", prev_class) == prev_class
                and raw_uncertainty < cfg.confidence_stability_threshold
            )
            cell.stable_observations = (
                min(cell.stable_observations + 1, cfg.confidence_stability_cap)
                if confirmed else 0
            )
            stability_factor = 1.0 / (1.0 + cfg.confidence_stability_gain * cell.stable_observations)
            cell.uncertainty = max(cfg.confidence_min_uncertainty, raw_uncertainty * stability_factor)
            cell.confidence = max(0.05, 1.0 - cell.uncertainty)
            if frame_id is not None:
                cell.last_seen_frame = frame_id

    def update_future_signal(self, future):
        # D3: `future` is now a probability-weighted FAN of candidate
        # positions per track (prediction/future_occupancy.py), not one
        # deterministic point. Each candidate's own `probability` weight
        # scales its contribution before the max-over-candidates -- a
        # low-probability side candidate landing near a cell can no
        # longer raise that cell's future_probability as much as the
        # high-probability straight-line candidate would. A single
        # probability=1.0 candidate (the old shape) behaves exactly as
        # before.
        for cell in self.active_regions():
            p = 0.0
            for f in future:
                d = math.hypot(cell.x - f["x"], cell.y - f["y"])
                sigma = max(0.25, f["sigma"])
                weight = f.get("probability", 1.0)
                p = max(p, weight * math.exp(-(d*d)/(2*sigma*sigma)))
            cell.future_probability = min(1.0, p)

    def active_regions(self):
        return [self.tree.nodes[rid] for rid in self.active_ids if self.tree.nodes[rid].active]

    def legal_transitions(self, region):
        levels = self.config.resolution_levels
        idx = levels.index(region.resolution)
        out = []
        if idx < len(levels)-1:
            out.append(levels[idx+1])  # refine
        if idx > 0:
            out.append(levels[idx-1])  # coarsen
        return out

    def cell_base_cost(self, resolution):
        # Transparent proxy for representation resource use.
        area = max(resolution**2, 1e-6)
        return 1.0 / area * 0.01

    def apply_decisions(self, decisions, frame_id, config):
        applied = []
        self._last_release = self._last_consumption = 0.0
        for d in decisions:
            region = self.tree.nodes.get(d["region_id"])
            if not region:
                continue
            old = region.resolution
            new = d["to_resolution"]
            if old == new:
                continue
            # A decision was computed against the cell as it looked when the
            # candidate list was built. If the cell has since been changed by
            # an EARLIER decision in this same batch, the decision is stale and
            # applying it corrupts the tree.
            #
            # This is not hypothetical. BudgetManager.allocate() builds its
            # coarsen and refine lists independently from the same candidate
            # pool, and a single 0.20 m cell produces BOTH a 0.20->0.50 coarsen
            # candidate and a 0.20->0.05 refine candidate. Those two transitions
            # have different IG and cost, so the coarsen can fall below
            # coarsen_threshold while the refine clears refine_threshold, and
            # the cell is selected twice. `selected = list(coarsen)` puts the
            # coarsen first, so by the time the refine ran the cell was already
            # at 0.50 m -- and children_for() then subdivided a 0.50 m cell,
            # producing 0.20 m children while the decision log recorded
            # "REFINE 0.50 -> 0.05". On real KITTI sequence 00 that happened to
            # every single 5 cm refine (42, 10, 14, 12 per frame over frames
            # 2-5), which is why no cell in the map ever actually reached
            # resolution_levels[2] and fine_cells was permanently 0.
            expected = d.get("from_resolution")
            if expected is not None and abs(expected - old) > 1e-9:
                continue
            # INVARIANT maintained throughout this class: a cell's
            # `active_cost` is non-zero if and only if that cell is currently
            # contributing to the running total `self.active_cost`. Every
            # place that activates or deactivates a cell must keep both sides
            # in step, otherwise the running total drifts away from the real
            # standing cost of the map and the allocator's remaining budget
            # (budget - active_cost) becomes fiction.
            old_cost = region.active_cost
            if new < old:  # refine
                children = self.tree.children_for(region)
                region.active = False
                self.active_ids.discard(region.region_id)
                # The parent stops contributing here (its old_cost is
                # subtracted below), so its own tally must be cleared too --
                # otherwise it keeps a stale non-zero active_cost while
                # inactive, and the next coarsen back onto this cell reads
                # that stale value as if it were live.
                region.active_cost = 0.0
                child_cost = 0.0
                for c in children:
                    c.active = True
                    c.semantic_class = region.semantic_class
                    c.semantic_importance = region.semantic_importance
                    c.motion = region.motion
                    c.uncertainty = region.uncertainty
                    c.geometry = region.geometry
                    c.distance_relevance = region.distance_relevance
                    c.future_probability = region.future_probability
                    c.last_seen_frame = region.last_seen_frame
                    c.active_cost = self.cell_base_cost(new)
                    self.active_ids.add(c.region_id)
                    child_cost += c.active_cost
                self.active_cost += child_cost - old_cost
                self._last_consumption += max(0.0, child_cost-old_cost)
                action = "REFINE"
                allocated = max(0.0, child_cost-old_cost)
            else:  # coarsen
                child_ids = list(region.children)
                release = 0.0
                newest_seen = region.last_seen_frame
                for cid in child_ids:
                    c = self.tree.nodes.get(cid)
                    if c and c.active:
                        c.active = False
                        self.active_ids.discard(cid)
                        release += c.active_cost
                        c.active_cost = 0.0  # no longer contributing
                        newest_seen = max(newest_seen, c.last_seen_frame)
                region.active = True
                self.active_ids.add(region.region_id)
                region.last_seen_frame = newest_seen
                region.resolution = new
                region.active_cost = self.cell_base_cost(new)
                # `old_cost` is this region's OWN previous contribution, and it
                # has to come off the total as well. Without it, coarsening a
                # cell that was already active (the overwhelmingly common case
                # -- a 0.20 m cell with no children of its own dropping back to
                # 0.50 m) *added* its new cost on top of its old one instead of
                # replacing it. Every such coarsen leaked exactly one cell's
                # standing cost: on real KITTI sequence 00 the running total
                # reached 5004 of a 5000 budget by frame 30 while the true
                # standing cost of the map was 174, so BudgetManager saw zero
                # remaining budget, refused every refine, and the map collapsed
                # to all-coarse with fine_cells stuck at 0 forever.
                self.active_cost += region.active_cost - release - old_cost
                # Net resources handed back = everything that stopped
                # contributing (children + this cell's old level) minus what
                # this cell now costs at its coarser level.
                freed = max(0.0, release + old_cost - region.active_cost)
                self._last_release += freed
                action = "COARSEN"
                allocated = -freed

            rec = {
                **d, "previous_resolution": old, "candidate_resolution": new,
                "allocated_cost": allocated, "action": action,
                "budget_after": max(0.0, config.computational_budget-self.active_cost),
                "resources_released": self._last_release,
                "resources_consumed": self._last_consumption,
                "reason": "utility-driven allocation under finite budget"
            }
            applied.append(rec)
        return applied

    def decay_stale_cells(self, frame_id, max_stale_frames):
        """Deactivate active cells that haven't received an observation in
        `max_stale_frames` frames (e.g. an object left the sensor's view).
        Releases their budget and clears their occupancy/semantic state so
        they don't linger as phantom detections, and so that if the same
        cell becomes active again later it starts from a clean state
        instead of resurrecting old data.

        Returns the list of region_ids that were released this frame.
        """
        if not max_stale_frames or max_stale_frames <= 0:
            return []
        released = []
        for cell in self.active_regions():
            if cell.last_seen_frame < 0:
                continue  # never actually observed; leave alone
            if frame_id - cell.last_seen_frame < max_stale_frames:
                continue
            self.active_ids.discard(cell.region_id)
            cell.active = False
            self.active_cost = max(0.0, self.active_cost - cell.active_cost)
            cell.active_cost = 0.0
            cell.occupancy = 0.0
            cell.semantic_class = "unknown"
            cell.semantic_importance = 0.0
            cell.motion = 0.0
            cell.uncertainty = 0.5
            cell.geometry = 0.0
            cell.distance_relevance = 0.0
            cell.future_probability = 0.0
            cell.confidence = 0.5
            cell.stable_observations = 0
            released.append(cell.region_id)
        return released

    def reclaim_resources(self):
        self.active_cost = max(0.0, self.active_cost)

    def active_cell_count(self):
        return len(self.active_regions())

    def count_resolution(self, resolution):
        return sum(1 for c in self.active_regions() if abs(c.resolution-resolution) < 1e-9)

    def serialize_active(self):
        return [c.to_dict() for c in self.active_regions()]