import numpy as np

def preprocess(frame, config, return_mask=False):
    points = np.asarray(frame["points"], dtype=float)
    if points.size == 0:
        empty = points.reshape(0, 3)
        return (empty, np.zeros(0, dtype=bool)) if return_mask else empty

    finite_mask = np.isfinite(points).all(axis=1)
    finite_points = points[finite_mask]

    # Lightweight statistical clipping around the usable map extent.
    w, h = config.map_dimensions
    bbox_mask = (
        (finite_points[:,0] >= -w/2) & (finite_points[:,0] <= w/2) &
        (finite_points[:,1] >= -h/2) & (finite_points[:,1] <= h/2) &
        (finite_points[:,2] >= -2) & (finite_points[:,2] <= 8)
    )

    if not return_mask:
        return finite_points[bbox_mask]

    # Combine both stages into a single mask aligned to the ORIGINAL input
    # array, so callers with a per-point label array (e.g. SemanticKITTI
    # .label files) can filter it identically and stay aligned with the
    # returned points - naive points[:n]/labels[:n] truncation after this
    # kind of boolean filtering silently mismatches points to the wrong
    # labels the moment anything is actually dropped.
    full_mask = np.zeros(len(points), dtype=bool)
    finite_indices = np.flatnonzero(finite_mask)
    full_mask[finite_indices[bbox_mask]] = True
    return finite_points[bbox_mask], full_mask