"""Tests for perception/pointnet2_semantic.py.

Split deliberately into two groups:

1. Pure-numpy logic (feature construction, intensity padding, grid
   aggregation) -- these run with no torch installed at all, since that's
   most of what could actually break silently (shape mismatches, empty
   input, region-schema drift) and none of it needs the model.

2. PointNet2Perception itself, which loads the real checkpoint through
   torch. Skipped via pytest.importorskip when torch isn't installed (e.g.
   this sandbox), so the rest of the suite still runs; on a machine with
   torch + the checkpoint present (as the team's dev machines should have),
   this exercises the real forward pass end to end.
"""

from pathlib import Path

import numpy as np
import pytest

from config import Config
from perception.pointnet2_semantic import (
    CLASS_NAME_MAP,
    aggregate_predictions_to_regions,
    build_pointnet_features,
    ensure_intensity_channel,
    sample_indices,
)

CHECKPOINT_PATH = Path(__file__).resolve().parent.parent / "checkpoints" / "pointnet2_foveamap.pth"


# --- Group 1: pure numpy, no torch required -------------------------------

def test_ensure_intensity_channel_pads_xyz_only_input():
    points3 = np.random.default_rng(0).uniform(-5, 5, size=(50, 3)).astype(np.float32)
    points4 = ensure_intensity_channel(points3)
    assert points4.shape == (50, 4)
    np.testing.assert_array_equal(points4[:, :3], points3)
    np.testing.assert_array_equal(points4[:, 3], np.zeros(50, dtype=np.float32))


def test_ensure_intensity_channel_passes_through_xyzi_input():
    points4_in = np.random.default_rng(1).uniform(-5, 5, size=(30, 4)).astype(np.float32)
    points4_out = ensure_intensity_channel(points4_in)
    np.testing.assert_array_equal(points4_in, points4_out)


def test_ensure_intensity_channel_rejects_bad_shape():
    with pytest.raises(ValueError):
        ensure_intensity_channel(np.zeros((10, 5), dtype=np.float32))


def test_build_pointnet_features_shape():
    points4 = np.random.default_rng(2).uniform(-5, 5, size=(200, 4)).astype(np.float32)
    features = build_pointnet_features(points4)
    assert features.shape == (9, 200)
    assert features.dtype == np.float32
    assert np.isfinite(features).all()


def test_sample_indices_without_replacement_when_enough_points():
    idx = sample_indices(n_points=100, num_points=20)
    assert len(idx) == 20
    assert len(set(idx)) == 20  # no duplicates


def test_sample_indices_with_replacement_when_too_few_points():
    idx = sample_indices(n_points=5, num_points=20)
    assert len(idx) == 20  # duplicates expected/allowed here


def test_aggregate_predictions_to_regions_schema_and_empty_case():
    config = Config()
    # A handful of points spread across a couple of grid cells, one class each.
    points4 = np.array([
        [1.0, 1.0, 0.0, 0.0],
        [1.1, 1.1, 0.0, 0.0],
        [-1.0, -1.0, 0.0, 0.0],
    ], dtype=np.float32)
    sampled_idx = np.array([0, 1, 2])
    predictions = np.array([0, 0, 2])  # terrain, terrain, dynamic
    confidence = np.array([0.9, 0.8, 0.95], dtype=np.float32)

    regions = aggregate_predictions_to_regions(points4, sampled_idx, predictions, confidence, config)

    assert len(regions) >= 1
    required_keys = {
        "x", "y", "z", "semantic_class", "semantic_importance", "motion",
        "uncertainty", "geometry", "distance_relevance", "occupancy", "confidence",
    }
    for region in regions:
        assert required_keys.issubset(region.keys())
        assert region["semantic_class"] in CLASS_NAME_MAP.values()

    # Empty input must not crash -- returns no regions, not an error.
    assert aggregate_predictions_to_regions(points4, np.array([], dtype=np.int64),
                                             np.array([]), np.array([]), config) == []


def test_dynamic_class_gets_nonzero_motion_signal():
    config = Config()
    points4 = np.array([[2.0, 2.0, 0.0, 0.0]] * 5, dtype=np.float32)
    sampled_idx = np.arange(5)
    predictions = np.full(5, 2)  # all "dynamic"
    confidence = np.full(5, 0.9, dtype=np.float32)

    regions = aggregate_predictions_to_regions(points4, sampled_idx, predictions, confidence, config)
    assert len(regions) == 1
    assert regions[0]["motion"] > 0
    assert regions[0]["semantic_class"] == CLASS_NAME_MAP[2]


# --- Group 2: real model + checkpoint, requires torch ---------------------

def test_pointnet2_perception_end_to_end_on_synthetic_cloud():
    pytest.importorskip("torch")
    if not CHECKPOINT_PATH.exists():
        pytest.skip(f"checkpoint not present at {CHECKPOINT_PATH}")

    from perception.pointnet2_semantic import PointNet2Perception

    perception = PointNet2Perception(checkpoint_path=str(CHECKPOINT_PATH))
    config = Config()

    rng = np.random.default_rng(3)
    synthetic_points = rng.uniform(-10, 10, size=(500, 4)).astype(np.float32)
    synthetic_points[:, 3] = rng.uniform(0, 1, size=500)  # plausible intensity

    scene = perception.perceive(synthetic_points, config)

    assert "regions" in scene and "dynamic_objects" in scene
    assert scene["dynamic_objects"] == []  # no instance IDs available, see module docstring
    for region in scene["regions"]:
        assert region["semantic_class"] in CLASS_NAME_MAP.values()
        assert 0.0 <= region["confidence"] <= 1.0
