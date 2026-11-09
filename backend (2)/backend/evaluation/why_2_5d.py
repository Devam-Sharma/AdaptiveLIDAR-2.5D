"""D5: Why 2.5D.

Contrasts this project's actual representation -- one Cell object per
active (x, y) footprint, carrying elevation plus occupancy/semantic/
motion/uncertainty state attached to that single object (mapping/cell.py)
-- against what a fully dense 3D voxel grid would need to cover the SAME
real active regions at the SAME (x, y) resolution: one voxel object per
vertical slice per cell instead of one object total.

This is pure accounting over data that already exists in the live map --
no second data structure is built, dense or otherwise, matching the
addendum's explicit non-negotiable that there is no second complete
future/3D map.
"""


def why_2_5d_report(map_manager, config):
    regions = map_manager.active_regions()
    vertical_extent = getattr(config, "vertical_extent_m", 3.0)

    examples = []
    for region in regions[:6]:
        examples.append({
            "region_id": region.region_id,
            "x": round(region.x, 3), "y": round(region.y, 3),
            "resolution": region.resolution,
            "elevation": round(region.elevation, 3),
            "occupancy": round(region.occupancy, 3),
            "semantic_class": region.semantic_class,
            "motion": round(region.motion, 3),
            "uncertainty": round(region.uncertainty, 3),
            "confidence": round(region.confidence, 3),
        })

    total_cells = len(regions)
    dense_voxels = 0
    for region in regions:
        z_bins = max(1, round(vertical_extent / max(region.resolution, 1e-6)))
        dense_voxels += z_bins

    return {
        "active_cell_count": total_cells,
        "vertical_extent_m": vertical_extent,
        "dense_3d_equivalent_voxel_count": dense_voxels,
        "voxel_to_cell_ratio": (dense_voxels / total_cells) if total_cells else None,
        "example_cells": examples,
        "explanation": (
            "Each active cell already carries elevation, occupancy, "
            "semantic class, motion and uncertainty attached to a single "
            "2D footprint -- see the example cells above. Representing "
            "the SAME real active region set as a dense 3D voxel grid at "
            "matching (x, y) resolution, spanning "
            f"{vertical_extent} m of height, would need one voxel object "
            "per vertical slice per cell instead of one object total: "
            f"{dense_voxels} voxels vs {total_cells} cells this frame."
        ),
    }