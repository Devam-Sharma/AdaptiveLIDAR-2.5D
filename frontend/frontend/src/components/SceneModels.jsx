// ---------------------------------------------------------------------------
// SCENE MODELS
// ---------------------------------------------------------------------------
// Reusable, data-driven SVG "3D-ish" shapes shared by the ego-perspective
// view (LiveLidarScene) and the top-down view (AdaptiveMap). These replace
// the old abstract point-cloud / wireframe-box placeholders with recognizable
// silhouettes: real car bodies, real building facades with windows, real
// trees with canopy + trunk, pedestrians, and road barriers. Everything here
// is still pure vector (no textures/assets to load) so it stays crisp at any
// size and keeps the existing color-by-semantic-class system intact.

// ---- EGO / CHASE-VIEW (rear-quarter) MODELS --------------------------------

// A car seen from behind/above, as the ego vehicle would see traffic ahead.
export function CarRearModel({ cx, groundY, width, height, color, dashed = false, opacity = 1 }) {
  const bodyH = height * 0.56;
  const cabinH = height * 0.52;
  const bodyY = groundY - bodyH;
  const cabinTopY = bodyY - cabinH * 0.86;
  const wheelW = width * 0.16;
  const wheelH = height * 0.15;
  return (
    <g opacity={opacity}>
      <ellipse cx={cx} cy={groundY + height * 0.05} fill="#000" opacity="0.35" rx={width * 0.52} ry={height * 0.09} />
      {/* rear wheels peeking under body */}
      <rect fill="#05080d" height={wheelH} rx={wheelW * 0.25} stroke="#334155" strokeWidth="0.1" width={wheelW} x={cx - width * 0.43} y={groundY - wheelH * 0.85} />
      <rect fill="#05080d" height={wheelH} rx={wheelW * 0.25} stroke="#334155" strokeWidth="0.1" width={wheelW} x={cx + width * 0.43 - wheelW} y={groundY - wheelH * 0.85} />
      {/* cabin / roof -- drawn BEHIND the body so the body's top edge reads as the
          beltline and the cabin only shows above it (like a real greenhouse) */}
      <path
        d={`M ${cx - width * 0.34} ${bodyY + bodyH * 0.1} L ${cx - width * 0.24} ${cabinTopY} Q ${cx} ${cabinTopY - height * 0.04} ${cx + width * 0.24} ${cabinTopY} L ${cx + width * 0.34} ${bodyY + bodyH * 0.1} Z`}
        fill="#1e293b"
        stroke="#7dd3fc"
        strokeOpacity="0.45"
        strokeWidth={Math.max(0.12, width * 0.012)}
      />
      {/* rear windshield glass */}
      <path
        d={`M ${cx - width * 0.29} ${bodyY + bodyH * 0.06} L ${cx - width * 0.205} ${cabinTopY + cabinH * 0.16} Q ${cx} ${cabinTopY + cabinH * 0.02} ${cx + width * 0.205} ${cabinTopY + cabinH * 0.16} L ${cx + width * 0.29} ${bodyY + bodyH * 0.06} Z`}
        fill="#bae6fd"
        fillOpacity="0.5"
      />
      {/* body */}
      <rect
        fill={color}
        fillOpacity="0.96"
        height={bodyH}
        rx={width * 0.1}
        stroke="#f8fafc"
        strokeDasharray={dashed ? `${width * 0.15} ${width * 0.1}` : undefined}
        strokeOpacity="0.9"
        strokeWidth={Math.max(0.18, width * 0.022)}
        width={width}
        x={cx - width / 2}
        y={bodyY}
      />
      {/* body highlight strip for a touch of pseudo-3D shading */}
      <rect fill="#fff" fillOpacity="0.14" height={bodyH * 0.22} rx={width * 0.06} width={width * 0.9} x={cx - width * 0.45} y={bodyY + bodyH * 0.08} />
      {/* tail lights */}
      <rect fill="#f87171" height={bodyH * 0.32} rx={width * 0.02} width={width * 0.13} x={cx - width * 0.47} y={bodyY + bodyH * 0.52} />
      <rect fill="#f87171" height={bodyH * 0.32} rx={width * 0.02} width={width * 0.13} x={cx + width * 0.34} y={bodyY + bodyH * 0.52} />
      {/* license plate glow */}
      <rect fill="#e6f6ff" fillOpacity="0.55" height={bodyH * 0.16} rx={width * 0.02} width={width * 0.2} x={cx - width * 0.1} y={bodyY + bodyH * 0.68} />
      {/* bumper line */}
      <rect fill="#000" fillOpacity="0.18" height={bodyH * 0.12} width={width} x={cx - width / 2} y={groundY - bodyH * 0.12} />
    </g>
  );
}

// A pedestrian / rider figure for the ego perspective.
export function PersonModel({ cx, groundY, height, color, opacity = 1 }) {
  const headR = height * 0.14;
  const headCy = groundY - height + headR;
  const bodyTop = headCy + headR * 0.9;
  const bodyBottom = groundY - height * 0.18;
  return (
    <g opacity={opacity}>
      <ellipse cx={cx} cy={groundY + height * 0.04} fill="#000" opacity="0.3" rx={headR * 1.6} ry={headR * 0.5} />
      <circle cx={cx} cy={headCy} fill={color} fillOpacity="0.95" r={headR} />
      <rect fill={color} fillOpacity="0.85" height={bodyBottom - bodyTop} rx={headR * 0.5} width={headR * 1.5} x={cx - headR * 0.75} y={bodyTop} />
      <rect fill="#0b1420" height={height * 0.18} rx={headR * 0.3} width={headR * 0.55} x={cx - headR * 0.9} y={groundY - height * 0.18} />
      <rect fill="#0b1420" height={height * 0.18} rx={headR * 0.3} width={headR * 0.55} x={cx + headR * 0.35} y={groundY - height * 0.18} />
    </g>
  );
}

// Striped road barrier / hazard block.
export function BarrierModel({ cx, groundY, width, height, color }) {
  const stripes = 4;
  const stripeW = width / stripes;
  return (
    <g>
      <ellipse cx={cx} cy={groundY + height * 0.06} fill="#000" opacity="0.28" rx={width * 0.5} ry={height * 0.1} />
      <rect fill="#0b1420" height={height} rx={height * 0.15} stroke={color} strokeOpacity="0.8" strokeWidth={Math.max(0.15, width * 0.02)} width={width} x={cx - width / 2} y={groundY - height} />
      {Array.from({ length: stripes }).map((_, i) => (
        <rect
          fill={i % 2 === 0 ? "#f8fafc" : "#ef4444"}
          fillOpacity="0.9"
          height={height * 0.62}
          key={i}
          width={stripeW * 0.72}
          x={cx - width / 2 + i * stripeW + stripeW * 0.14}
          y={groundY - height * 0.81}
        />
      ))}
    </g>
  );
}

// A building facade seen edge-on, defined by its screen-space left/right
// ground anchors so it correctly skews with the perspective projection.
export function BuildingFacade({ leftX, rightX, groundY, height, color, seed = 1 }) {
  const width = rightX - leftX;
  if (width <= 0.2 || height <= 0.4) return null;
  const floors = Math.max(2, Math.round(height / 1.7));
  const cols = Math.max(2, Math.round(width / 1.6));
  const topY = groundY - height;
  const winW = (width / cols) * 0.6;
  const winH = (height / floors) * 0.55;
  const windows = [];
  for (let f = 0; f < floors; f += 1) {
    for (let c = 0; c < cols; c += 1) {
      const lit = (seed * 977 + f * 31 + c * 17) % 5 !== 0; // most windows lit, a few dark
      windows.push({
        x: leftX + (width * (c + 0.5)) / cols - winW / 2,
        y: topY + (height * (f + 0.5)) / floors - winH / 2,
        lit,
      });
    }
  }
  return (
    <g>
      <rect fill="#0a1520" height={height} stroke={color} strokeOpacity="0.4" strokeWidth="0.12" width={width} x={leftX} y={topY} />
      {/* roofline cap */}
      <rect fill={color} fillOpacity="0.35" height={Math.min(0.6, height * 0.05)} width={width} x={leftX} y={topY} />
      {windows.map((w, i) => (
        <rect fill={w.lit ? color : "#0d1b28"} fillOpacity={w.lit ? 0.55 : 0.9} height={winH} key={i} width={winW} x={w.x} y={w.y} />
      ))}
    </g>
  );
}

// Tree seen from the side: trunk + layered canopy blobs.
export function TreeSide({ cx, groundY, scale }) {
  const trunkH = 2.2 * scale;
  const canopyR = 2.8 * scale;
  const canopyCy = groundY - trunkH - canopyR * 0.55;
  return (
    <g>
      <ellipse cx={cx} cy={groundY + 0.15 * scale} fill="#000" opacity="0.25" rx={canopyR * 0.9} ry={0.4 * scale} />
      <rect fill="#7c4a1e" height={trunkH} width={Math.max(0.15, 0.32 * scale)} x={cx - 0.16 * scale} y={groundY - trunkH} />
      <circle cx={cx} cy={canopyCy} fill="#166534" fillOpacity="0.9" r={canopyR} />
      <circle cx={cx - canopyR * 0.5} cy={canopyCy + canopyR * 0.2} fill="#22c55e" fillOpacity="0.85" r={canopyR * 0.62} />
      <circle cx={cx + canopyR * 0.55} cy={canopyCy + canopyR * 0.1} fill="#4ade80" fillOpacity="0.75" r={canopyR * 0.55} />
    </g>
  );
}

// ---- TOP-DOWN (map) MODELS -------------------------------------------------

export function CarTop({ cx, cy, w, h, color, heading = 0, dashed = false, opacity = 1 }) {
  return (
    <g opacity={opacity} transform={`rotate(${heading} ${cx} ${cy})`}>
      <rect
        fill={color}
        fillOpacity="0.92"
        height={h}
        rx={w * 0.28}
        stroke="#e6f6ff"
        strokeDasharray={dashed ? `${w * 0.3} ${w * 0.2}` : undefined}
        strokeOpacity="0.85"
        strokeWidth={Math.max(0.12, w * 0.06)}
        width={w}
        x={cx - w / 2}
        y={cy - h / 2}
      />
      {/* windshield (front) */}
      <rect fill="#07131b" fillOpacity="0.85" height={h * 0.24} rx={w * 0.12} width={w * 0.74} x={cx - w * 0.37} y={cy - h * 0.34} />
      {/* rear window */}
      <rect fill="#07131b" fillOpacity="0.7" height={h * 0.18} rx={w * 0.1} width={w * 0.6} x={cx - w * 0.3} y={cy + h * 0.12} />
      {/* headlights */}
      <rect fill="#e6f6ff" fillOpacity="0.9" height={h * 0.08} width={w * 0.14} x={cx - w * 0.42} y={cy - h * 0.46} />
      <rect fill="#e6f6ff" fillOpacity="0.9" height={h * 0.08} width={w * 0.14} x={cx + w * 0.28} y={cy - h * 0.46} />
    </g>
  );
}

export function BuildingTop({ x, y, w, h, color, seed = 1 }) {
  const pad = Math.min(w, h) * 0.1;
  // Rooftop units (AC condensers with fin lines) scattered deterministically.
  const unitCount = Math.max(1, Math.min(3, Math.round((w * h) / 60)));
  const units = Array.from({ length: unitCount }).map((_, i) => {
    const s = Math.min(w, h) * 0.22;
    return {
      x: x + pad + (((seed + i) * 37) % Math.max(1, w - pad * 2 - s)),
      y: y + pad + (((seed + i) * 19) % Math.max(1, h - pad * 2 - s)),
      s,
    };
  });
  // Stairwell / elevator hatch in a corner -- reads as a real rooftop feature.
  const hatchS = Math.min(w, h) * 0.3;
  return (
    <g>
      {/* roof slab */}
      <rect fill="#0d1b28" height={h} rx={Math.min(w, h) * 0.06} width={w} x={x} y={y} />
      {/* parapet edge */}
      <rect fill="none" height={h} rx={Math.min(w, h) * 0.06} stroke={color} strokeOpacity="0.75" strokeWidth={Math.max(0.18, Math.min(w, h) * 0.03)} width={w} x={x} y={y} />
      {/* subtle expansion-joint grid so the roof reads as a real surface */}
      <line stroke={color} strokeOpacity="0.15" strokeWidth="0.12" x1={x + w / 3} x2={x + w / 3} y1={y} y2={y + h} />
      <line stroke={color} strokeOpacity="0.15" strokeWidth="0.12" x1={x + (2 * w) / 3} x2={x + (2 * w) / 3} y1={y} y2={y + h} />
      <line stroke={color} strokeOpacity="0.15" strokeWidth="0.12" x1={x} x2={x + w} y1={y + h / 2} y2={y + h / 2} />
      {/* stairwell / elevator housing */}
      <rect fill="#1e293b" height={hatchS} rx={hatchS * 0.15} stroke={color} strokeOpacity="0.6" strokeWidth="0.15" width={hatchS} x={x + w - hatchS - pad * 0.6} y={y + pad * 0.6} />
      <line stroke={color} strokeOpacity="0.5" strokeWidth="0.1" x1={x + w - hatchS - pad * 0.6} x2={x + w - pad * 0.6} y1={y + pad * 0.6 + hatchS / 2} y2={y + pad * 0.6 + hatchS / 2} />
      {/* AC condenser units with fin hatching */}
      {units.map((u, i) => (
        <g key={i}>
          <rect fill="#334155" height={u.s} rx={u.s * 0.12} stroke={color} strokeOpacity="0.5" strokeWidth="0.12" width={u.s} x={u.x} y={u.y} />
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} stroke="#0d1b28" strokeWidth="0.12" x1={u.x + u.s * f} x2={u.x + u.s * f} y1={u.y + u.s * 0.15} y2={u.y + u.s * 0.85} />
          ))}
        </g>
      ))}
      {/* corner shadow for a touch of depth */}
      <rect fill="#000" fillOpacity="0.18" height={h * 0.22} width={w} x={x} y={y + h - h * 0.22} />
    </g>
  );
}

export function BarrierTop({ x, y, w, h }) {
  const stripes = 3;
  const stripeH = h / stripes;
  return (
    <g>
      <rect fill="#0b1420" height={h} rx={Math.min(w, h) * 0.15} stroke="#ef4444" strokeOpacity="0.8" strokeWidth="0.15" width={w} x={x} y={y} />
      {Array.from({ length: stripes }).map((_, i) => (
        <rect fill={i % 2 === 0 ? "#f8fafc" : "#ef4444"} fillOpacity="0.85" height={stripeH * 0.7} key={i} width={w * 0.72} x={x + w * 0.14} y={y + i * stripeH + stripeH * 0.15} />
      ))}
    </g>
  );
}

export function TreeTop({ cx, cy, r }) {
  return (
    <g>
      <circle cx={cx} cy={cy} fill="#14532d" fillOpacity="0.9" r={r} />
      <circle cx={cx - r * 0.3} cy={cy - r * 0.25} fill="#22c55e" fillOpacity="0.75" r={r * 0.62} />
      <circle cx={cx + r * 0.32} cy={cy + r * 0.2} fill="#4ade80" fillOpacity="0.55" r={r * 0.48} />
    </g>
  );
}

// A four-legged animal (deer/dog silhouette) seen from above -- used for the
// wildlife-hazard scenario on the Prediction page instead of a plain rect.
export function AnimalTop({ cx, cy, w, h, color = "#f97316", selected = false }) {
  const legW = w * 0.1;
  const legH = h * 0.3;
  const bodyRx = w * 0.36;
  const bodyRy = h * 0.24;
  return (
    <g>
      <ellipse cx={cx} cy={cy + h * 0.46} fill="#000" opacity="0.25" rx={w * 0.4} ry={h * 0.1} />
      {/* body */}
      <ellipse cx={cx} cy={cy} fill={color} fillOpacity="0.95" rx={bodyRx} ry={bodyRy} stroke="#fff" strokeOpacity={selected ? 0.95 : 0.55} strokeWidth={selected ? 0.5 : 0.22} />
      {/* legs poking out past the body silhouette, front + back pairs */}
      {[-1, 1].map((sy) =>
        [-1, 1].map((sx) => (
          <rect
            fill="#78350f"
            fillOpacity="0.9"
            height={legH}
            key={`${sx}-${sy}`}
            rx={legW * 0.3}
            width={legW}
            x={cx + sx * bodyRx * 0.75 - legW / 2}
            y={cy + sy * bodyRy * 0.7 - (sy > 0 ? 0 : legH * 0.15)}
          />
        )),
      )}
      {/* neck + head, offset to the front */}
      <rect fill={color} fillOpacity="0.95" height={h * 0.32} rx={w * 0.08} width={w * 0.16} x={cx - w * 0.08} y={cy - h * 0.62} />
      <circle cx={cx} cy={cy - h * 0.62} fill={color} fillOpacity="0.98" r={w * 0.15} />
      {/* ears */}
      <path d={`M ${cx - w * 0.11} ${cy - h * 0.72} l -${w * 0.07} -${h * 0.16} l ${w * 0.13} ${h * 0.05} Z`} fill={color} fillOpacity="0.85" />
      <path d={`M ${cx + w * 0.11} ${cy - h * 0.72} l ${w * 0.07} -${h * 0.16} l -${w * 0.13} ${h * 0.05} Z`} fill={color} fillOpacity="0.85" />
      {/* tail */}
      <path d={`M ${cx} ${cy + bodyRy * 0.9} q ${w * 0.06} ${h * 0.14} 0 ${h * 0.24}`} fill="none" stroke={color} strokeLinecap="round" strokeOpacity="0.9" strokeWidth={legW * 0.7} />
    </g>
  );
}
