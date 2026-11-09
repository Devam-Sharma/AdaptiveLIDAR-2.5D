class BudgetManager:
    def __init__(self, config):
        self.config = config

    def allocate(self, candidates, map_manager):
        # First decide which regions should coarsen based on low utility.
        coarsen = [
            c for c in candidates
            if c["to_resolution"] > c["from_resolution"]
            and c["utility"] <= self.config.coarsen_threshold
        ]
        # Refine candidates are ranked by utility = IG / cost.
        refine = sorted(
            [c for c in candidates if c["to_resolution"] < c["from_resolution"]],
            key=lambda c: c["utility"], reverse=True
        )

        # De-conflict: a single region can legally produce BOTH a qualifying
        # coarsen candidate and a qualifying refine candidate in the same
        # frame (they're evaluated on different transitions with different
        # IG/cost). apply_decisions() applies coarsen first and then drops
        # any refine whose `from_resolution` no longer matches (to avoid
        # corrupting the tree), so an unfiltered `selected` list silently
        # starved every refine that collided with a coarsen -- no cell ever
        # reached the finest resolution level. Refine reflects a stronger,
        # more specific signal (an object needs detail) than coarsen (this
        # area is low-value), so when both fire for the same region, refine
        # wins and the coarsen is dropped instead.
        refine_ids = {c["region_id"] for c in refine if c["utility"] >= self.config.refine_threshold}
        coarsen = [c for c in coarsen if c["region_id"] not in refine_ids]

        selected = list(coarsen)
        remaining = max(0.0, self.config.computational_budget - map_manager.active_cost)

        for c in refine:
            if c["utility"] < self.config.refine_threshold:
                continue
            if c["cost"] <= remaining:
                selected.append(c)
                remaining -= c["cost"]
        return selected