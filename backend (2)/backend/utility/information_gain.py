def resolution_gain(from_r, to_r):
    if to_r >= from_r:
        return 0.0
    return min(1.0, (from_r-to_r) / max(from_r, 1e-9))

def estimate_information_gain(region, transition, iv, ev, config):
    # IG = BaseBenefit * ResolutionGain * ConfidenceOfBenefit
    # Future relevance is kept distinct from current information value.
    gain = resolution_gain(region.resolution, transition)
    if gain <= 0:
        # For coarsening, negative benefit is represented as zero IG;
        # coarsening is handled by threshold/resource reclamation.
        return 0.0
    base = (
        config.aU * region.uncertainty +
        config.aS * region.semantic_importance +
        config.aG * region.geometry +
        config.aM * region.motion +
        config.aF * region.future_probability
    )
    confidence_of_benefit = 0.5 + 0.5 * (1.0 - region.confidence)
    return max(0.0, base * gain * confidence_of_benefit * 10.0)
