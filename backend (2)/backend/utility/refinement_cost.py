def estimate_refinement_cost(region, transition, config):
    if transition >= region.resolution:
        # Coarsening is a resource release rather than a refinement charge.
        return 0.001
    ratio = region.resolution / transition
    old_cells = 1.0
    new_cells = ratio * ratio
    estimated_new_cells = max(0.0, new_cells - old_cells)
    added_state = estimated_new_cells
    point_work = estimated_new_cells * 4.0
    compute = config.k_compute * estimated_new_cells
    memory = config.k_memory * added_state
    points = config.k_points * point_work
    return max(0.001, (compute + memory + points) * config.hardware_multiplier)
