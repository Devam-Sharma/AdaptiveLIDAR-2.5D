def current_information_value(region, config):
    return (
        config.wS * region.semantic_importance +
        config.wM * region.motion +
        config.wU * region.uncertainty +
        config.wG * region.geometry +
        config.wD * region.distance_relevance
    )

def future_expected_value(region, config):
    return config.wP * region.future_probability
