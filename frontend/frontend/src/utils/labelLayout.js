// ---------------------------------------------------------------------------
// LABEL COLLISION AVOIDANCE
// ---------------------------------------------------------------------------
// Both map panels draw a small callout tag above every tracked object. When
// two objects sit close together on screen (e.g. the pedestrian and the
// moving vehicle passing near each other), their tags used to be placed
// independently and would overlap into unreadable smashed-together text.
// This does simple greedy vertical stacking: each label starts at its
// object's natural position, and if that would collide with an
// already-placed label, it gets lifted further away (in more increments)
// until it clears every other label placed so far.
//
// items: [{ id, cx, w, baseY, h }] -- cx/baseY are the label's natural
// (unstacked) center-x and bottom-y; w/h are its box size.
// Returns: { [id]: liftedY } -- the y to actually render that label at
// (same cx, only y changes) so connector lines still point at the right x.
export function layoutLabels(items, { gap = 1, step = 6, maxTiers = 6 } = {}) {
  const placed = [];
  const result = {};

  // Objects closer to the bottom of the frame (nearer the viewer) are more
  // important to keep readable at their natural spot, so resolve them first
  // and let farther-away objects give way.
  const ordered = [...items].sort((a, b) => b.baseY - a.baseY);

  for (const item of ordered) {
    const halfW = item.w / 2;
    let tier = 0;
    let y = item.baseY;

    const overlapsAny = () => {
      const x0 = item.cx - halfW - gap;
      const x1 = item.cx + halfW + gap;
      const y0 = y - item.h - gap;
      const y1 = y + gap;
      return placed.some((p) => x0 < p.x1 && x1 > p.x0 && y0 < p.y1 && y1 > p.y0);
    };

    while (overlapsAny() && tier < maxTiers) {
      tier += 1;
      y = item.baseY - tier * step;
    }

    placed.push({ x0: item.cx - halfW, x1: item.cx + halfW, y0: y - item.h, y1: y });
    result[item.id] = y;
  }

  return result;
}
