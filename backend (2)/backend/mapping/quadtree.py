from .cell import Cell

# Fields copied from a parent cell onto its freshly-created children so a
# refined cell shows a sensible best guess immediately instead of the Cell
# dataclass default ("unknown", 0 importance, etc.) for the one frame it
# takes update_observations() to give the child its own real reading. Only
# semantic/observation-derived fields are inherited -- geometry (x, y, size,
# resolution, region_id, parent_id, children) is deliberately excluded since
# each child has its own.
_INHERITED_FIELDS = (
    "semantic_class", "semantic_importance", "confidence",
    "motion", "uncertainty", "geometry", "distance_relevance",
    "future_probability", "occupancy",
)


def _inherit_from_parent(child, parent):
    for field_name in _INHERITED_FIELDS:
        setattr(child, field_name, getattr(parent, field_name))
    return child


class QuadTree:
    def __init__(self, config):
        self.config = config
        self.nodes = {}
        self._build_roots()

    def _build_roots(self):
        w, h = self.config.map_dimensions
        size = self.config.resolution_levels[0]
        step = size
        nx, ny = int(w/step), int(h/step)
        # Sparse roots are created only where needed by observations.
        self.root_size = step
        self.roots = {}

    def get_or_create(self, x, y):
        r = self.config.resolution_levels[0]
        w, h = self.config.map_dimensions
        # The key is a non-negative grid index, so the world->index transform
        # shifts the origin to the map corner by adding w/2, h/2.
        key = (int((x + w/2)/r),
               int((y + h/2)/r))
        rid = f"r-{key[0]}-{key[1]}"
        if rid not in self.nodes:
            # Inverting that transform to recover the cell CENTRE in true world
            # metres means subtracting the same w/2, h/2 back off and adding
            # half a cell. Previously this was `key[0]*r - r/2`, which both
            # omitted the -w/2 shift and moved half a cell the wrong way,
            # putting every root cell a constant (w/2, h/2) -- 20 m, 15 m on
            # the default 40x30 window -- away from where it really is.
            #
            # That mattered twice: update_future_signal() compares cell.x/y
            # against predictions that ARE in true world metres, so the
            # future-occupancy Gaussian was being applied to cells ~20 m away
            # from the predicted object; and the frontend's metersToCanvas()
            # then pinned every static cell to the far corner of the canvas.
            self.nodes[rid] = Cell(rid, key[0]*r - w/2 + r/2, key[1]*r - h/2 + r/2, r, r)
        return self.nodes[rid]

    def locate_cell(self, x, y):
        """Return the node that currently represents (x, y) at whatever
        resolution the tree is actually holding right now -- the root if
        it hasn't been refined (or has been coarsened back), or the
        specific descendant cell if it has. Creates the root on first
        touch, same as get_or_create did, but no longer blindly returns
        the root once that area has been refined into children.
        """
        cell = self.get_or_create(x, y)
        while (not cell.active) and cell.children:
            cell = self._child_at(cell, x, y)
        return cell

    def _child_at(self, parent, x, y):
        levels = self.config.resolution_levels
        idx = levels.index(parent.resolution)
        if idx >= len(levels) - 1:
            return parent
        child_size = levels[idx + 1]
        factor = max(1, round(parent.size / child_size))
        ix = int((x - (parent.x - parent.size / 2)) / child_size)
        iy = int((y - (parent.y - parent.size / 2)) / child_size)
        ix = min(max(ix, 0), factor - 1)
        iy = min(max(iy, 0), factor - 1)
        rid = f"{parent.region_id}/{ix}-{iy}"
        child = self.nodes.get(rid)
        if child is None:
            # Defensive fallback -- children_for should already have made
            # this, but don't let a missing node crash observation routing.
            cx = parent.x - parent.size / 2 + child_size / 2 + ix * child_size
            cy = parent.y - parent.size / 2 + child_size / 2 + iy * child_size
            child = _inherit_from_parent(Cell(rid, cx, cy, child_size, child_size, parent.region_id), parent)
            self.nodes[rid] = child
            if rid not in parent.children:
                parent.children.append(rid)
        return child

    def children_for(self, parent):
        levels = self.config.resolution_levels
        idx = levels.index(parent.resolution)
        if idx >= len(levels)-1:
            return []
        child_size = levels[idx+1]
        factor = max(1, round(parent.size / child_size))
        children = []
        for ix in range(factor):
            for iy in range(factor):
                x = parent.x - parent.size/2 + child_size/2 + ix*child_size
                y = parent.y - parent.size/2 + child_size/2 + iy*child_size
                rid = f"{parent.region_id}/{ix}-{iy}"
                c = self.nodes.get(rid)
                if c is None:
                    c = _inherit_from_parent(Cell(rid, x, y, child_size, child_size, parent.region_id), parent)
                    self.nodes[rid] = c
                children.append(c)
        parent.children = [c.region_id for c in children]
        return children