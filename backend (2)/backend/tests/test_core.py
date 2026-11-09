from config import Config
from mapping.map_manager import MapManager
from utility.information_gain import estimate_information_gain
from utility.refinement_cost import estimate_refinement_cost
from utility.information_value import current_information_value

def test_information_value_nonnegative():
    c = Config()
    m = MapManager(c)
    m.update_observations([{
        "x":0,"y":0,"z":0,"occupancy":1,"semantic_class":"pedestrian",
        "semantic_importance":1,"motion":1,"uncertainty":.5,"geometry":.5,
        "distance_relevance":1
    }])
    r = m.active_regions()[0]
    assert current_information_value(r,c) >= 0

def test_gain_transition():
    c = Config()
    m = MapManager(c)
    m.update_observations([{
        "x":0,"y":0,"z":0,"occupancy":1,"semantic_class":"pedestrian",
        "semantic_importance":1,"motion":1,"uncertainty":.5,"geometry":.5,
        "distance_relevance":1
    }])
    r = m.active_regions()[0]
    iv = current_information_value(r,c)
    ig = estimate_information_gain(r,.2,iv,0.5,c)
    cost = estimate_refinement_cost(r,.2,c)
    assert ig > 0
    assert cost > 0
