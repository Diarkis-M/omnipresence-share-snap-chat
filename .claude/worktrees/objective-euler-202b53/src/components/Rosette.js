'use client';

/** PCF Rosette — dynamic N-gon radar chart + donut for 1-2 dimensions.
 *  values  = [Reach, Engagement, Parasocial, BrandFit, Growth] (0-100 each)
 *  weights = optional array matching values; dimensions with weight 0 are excluded
 *            -> pentagon (5), quadrilateral (4), triangle (3) = radar
 *            -> 2 dimensions = two-segment donut
 *            -> 1 dimension = single-arc donut
 *            -> 0 = empty dot
 *  size    = SVG pixel dimensions (36 table, 56 dossier, 64 landing, 94 processing, 110 model preview)
 *  labels  = optional short labels for each axis (shown on larger sizes)
 */
export default function Rosette({ values = [0,0,0,0,0], weights, size = 60, accent = 'var(--accent)', labels }) {
  const cx = size / 2, cy = size / 2, r = size * 0.45;

  // Filter to active dimensions (weight > 0 or no weights provided)
  const active = values.map((v, i) => ({
    v: Math.max(0, v || 0),
    w: weights ? (weights[i] || 0) : 1,
    label: labels ? labels[i] : null,
    idx: i,
  })).filter(d => d.w > 0);

  const N = active.length;

  // ── Empty state — no active dimensions ──
  if (N === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={2} fill="var(--muted)" opacity="0.3" />
      </svg>
    );
  }

  // ── DONUT: Single dimension ──
  if (N === 1) {
    const donutR = size * 0.32;
    const strokeW = size * 0.11;
    const circumference = 2 * Math.PI * donutR;
    const fillPct = Math.max(0, Math.min(100, active[0].v)) / 100;
    const dashFill = fillPct * circumference;
    const dashGap = circumference - dashFill;

    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <circle
          cx={cx} cy={cy} r={donutR}
          fill="none" stroke="var(--rosette-grid)" strokeWidth={strokeW}
          opacity="0.35"
        />
        {/* Fill arc — starts at 12 o'clock */}
        <circle
          cx={cx} cy={cy} r={donutR}
          fill="none" stroke={accent} strokeWidth={strokeW}
          strokeDasharray={`${dashFill} ${dashGap}`}
          transform={`rotate(-90, ${cx}, ${cy})`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.3s ease' }}
        />
        {/* Center value */}
        <text
          x={cx} y={cy - (size >= 80 ? 2 : 0)}
          textAnchor="middle" dominantBaseline="central"
          fill="var(--ink)" fontSize={size >= 80 ? 16 : size >= 50 ? 12 : 10}
          fontWeight="600" fontFamily="var(--font-mono)"
        >
          {Math.round(active[0].v)}
        </text>
        {/* Label below value on larger sizes */}
        {labels && size >= 80 && active[0].label && (
          <text
            x={cx} y={cy + (size >= 120 ? 14 : 11)}
            textAnchor="middle" dominantBaseline="central"
            fill="var(--muted)" fontSize={size >= 120 ? 8 : 7}
            fontFamily="var(--font-mono)"
          >
            {active[0].label}
          </text>
        )}
      </svg>
    );
  }

  // ── DONUT: Two dimensions ──
  if (N === 2) {
    const donutR = size * 0.32;
    const strokeW = size * 0.11;
    const circumference = 2 * Math.PI * donutR;
    const total = active[0].v + active[1].v;
    const pct0 = total > 0 ? active[0].v / total : 0.5;
    const arc0 = pct0 * circumference;
    const arc1 = circumference - arc0;
    const gap = Math.min(4, circumference * 0.015);

    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <circle
          cx={cx} cy={cy} r={donutR}
          fill="none" stroke="var(--rosette-grid)" strokeWidth={strokeW}
          opacity="0.25"
        />
        {/* Segment 1 (accent) */}
        <circle
          cx={cx} cy={cy} r={donutR}
          fill="none" stroke={accent} strokeWidth={strokeW}
          strokeDasharray={`${Math.max(0, arc0 - gap)} ${circumference - Math.max(0, arc0 - gap)}`}
          transform={`rotate(-90, ${cx}, ${cy})`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.3s ease' }}
        />
        {/* Segment 2 (ink) */}
        <circle
          cx={cx} cy={cy} r={donutR}
          fill="none" stroke="var(--ink)" strokeWidth={strokeW}
          strokeDasharray={`${Math.max(0, arc1 - gap)} ${circumference - Math.max(0, arc1 - gap)}`}
          strokeDashoffset={-arc0}
          transform={`rotate(-90, ${cx}, ${cy})`}
          strokeLinecap="round"
          opacity="0.55"
          style={{ transition: 'stroke-dasharray 0.3s ease, stroke-dashoffset 0.3s ease' }}
        />
        {/* Center labels — hide on very small sizes where text won't fit */}
        {labels && size >= 80 ? (
          <>
            <text
              x={cx} y={cy - 7}
              textAnchor="middle" dominantBaseline="central"
              fill={accent} fontSize={size >= 120 ? 10 : 8.5}
              fontWeight="600" fontFamily="var(--font-mono)"
            >
              {active[0].label} {Math.round(active[0].v)}
            </text>
            <text
              x={cx} y={cy + 8}
              textAnchor="middle" dominantBaseline="central"
              fill="var(--ink)" fontSize={size >= 120 ? 10 : 8.5}
              fontWeight="500" fontFamily="var(--font-mono)"
              opacity="0.55"
            >
              {active[1].label} {Math.round(active[1].v)}
            </text>
          </>
        ) : size >= 44 ? (
          <text
            x={cx} y={cy}
            textAnchor="middle" dominantBaseline="central"
            fill="var(--ink)" fontSize={size >= 50 ? 11 : 9}
            fontWeight="600" fontFamily="var(--font-mono)"
          >
            {Math.round(active[0].v)}/{Math.round(active[1].v)}
          </text>
        ) : null}
      </svg>
    );
  }

  // ── N >= 3 — proper polygon radar chart ──
  const angle = (i) => -Math.PI / 2 + i * 2 * Math.PI / N;

  const dataPts = active.map((d, i) => {
    const a = angle(i);
    const rr = (d.v / 100) * r;
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  });

  const outerPts = Array.from({ length: N }, (_, i) => {
    const a = angle(i);
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });

  const halfPts = outerPts.map(p => [
    cx + (p[0] - cx) * 0.5,
    cy + (p[1] - cy) * 0.5,
  ]);

  // Label positions (slightly outside the outer ring)
  const labelPts = labels ? Array.from({ length: N }, (_, i) => {
    const a = angle(i);
    const lr = r * 1.22;
    return [cx + Math.cos(a) * lr, cy + Math.sin(a) * lr];
  }) : [];

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Outer ring */}
      <polygon
        points={outerPts.map(p => p.join(',')).join(' ')}
        fill="none" stroke="var(--rosette-grid)" strokeWidth="0.5"
      />
      {/* 50% ring */}
      <polygon
        points={halfPts.map(p => p.join(',')).join(' ')}
        fill="none" stroke="var(--rosette-grid)" strokeWidth="0.4"
      />
      {/* Spokes */}
      {outerPts.map((p, i) => (
        <line key={i} x1={cx} y1={cy} x2={p[0]} y2={p[1]} stroke="var(--rosette-grid)" strokeWidth="0.4" />
      ))}
      {/* Data polygon */}
      <polygon
        points={dataPts.map(p => p.join(',')).join(' ')}
        fill={accent} fillOpacity="0.18" stroke={accent} strokeWidth="1.2"
      />
      {/* Vertex dots */}
      {dataPts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="1.6" fill={accent} />
      ))}
      {/* Axis labels (only on larger sizes, when labels prop is provided) */}
      {labels && size >= 80 && active.map((d, i) => {
        if (!d.label) return null;
        const lp = labelPts[i];
        if (!lp) return null;
        return (
          <text
            key={i}
            x={lp[0]} y={lp[1]}
            textAnchor="middle" dominantBaseline="central"
            fill="var(--muted)" fontSize={size >= 120 ? 8 : 7}
            fontFamily="var(--font-mono)"
          >
            {d.label}
          </text>
        );
      })}
    </svg>
  );
}
