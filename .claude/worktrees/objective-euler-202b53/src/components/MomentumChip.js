'use client';

import { useState } from 'react';
import { MOMENTUM_SPEC } from '@/config/gates';

const TONE_MAP = {
  success: { c: 'var(--mom-success)', bg: 'var(--mom-success-bg)' },
  warning: { c: 'var(--mom-warning)', bg: 'var(--mom-warning-bg)' },
  danger:  { c: 'var(--mom-danger)',  bg: 'var(--mom-danger-bg)' },
  neutral: { c: 'var(--mom-neutral)', bg: 'var(--mom-neutral-bg)' },
  muted:   { c: 'var(--mom-muted)',   bg: 'var(--mom-muted-bg)' },
};

/**
 * Channel Momentum chip — bucket label + sparkline + hover tooltip.
 * mom = { bucket, last30, prior90, trend: number[], lastUpload }
 * size = 'md' (table) or 'lg' (processing hero)
 */
export default function MomentumChip({ mom, sparkline = true, size = 'md' }) {
  const [hovered, setHovered] = useState(false);

  if (!mom || !mom.bucket) return null;
  const m = MOMENTUM_SPEC[mom.bucket] || MOMENTUM_SPEC['low-signal'];
  const tone = TONE_MAP[m.tone] || TONE_MAP.muted;
  const big = size === 'lg';
  const trend = mom.trend || [];
  const max = Math.max(1, ...trend.filter(v => v != null));
  const w = big ? 52 : 40;
  const h = big ? 16 : 12;

  // Build tooltip text
  const tooltipLines = [];
  tooltipLines.push(m.label + ' — ' + m.desc);
  if (mom.last30 != null) tooltipLines.push('Videos (last 30d): ' + mom.last30);
  if (mom.prior90 != null) tooltipLines.push('Videos (30–120d): ' + mom.prior90);
  if (mom.lastUpload && mom.lastUpload !== '?') tooltipLines.push('Last upload: ' + mom.lastUpload + ' ago');
  if (trend.length > 0) {
    const recentWeeks = trend.slice(-4);
    const weekLabels = recentWeeks.map((v, i) => 'W' + (trend.length - 3 + i) + ':' + v);
    tooltipLines.push('Recent weeks: ' + weekLabels.join('  '));
  }

  // Explain the bucket decision
  if (mom.bucket === 'dormant') {
    tooltipLines.push('');
    tooltipLines.push('Why dormant: No videos in last 30 days');
    tooltipLines.push('and last upload was over 60 days ago.');
  } else if (mom.bucket === 'slowing') {
    tooltipLines.push('');
    if (mom.last30 === 0) {
      tooltipLines.push('Why slowing: No videos in last 30 days');
      tooltipLines.push('but last upload was within 60 days.');
    } else {
      tooltipLines.push('Why slowing: Recent 6-week upload pace');
      tooltipLines.push('dropped below 60% of prior 6 weeks.');
    }
  } else if (mom.bucket === 'accelerating') {
    tooltipLines.push('');
    tooltipLines.push('Why accelerating: Recent 6-week uploads');
    tooltipLines.push('exceed prior 6 weeks by 30%+.');
  } else if (mom.bucket === 'active') {
    tooltipLines.push('');
    tooltipLines.push('Why active: 4+ videos in last 30 days');
    tooltipLines.push('with consistent pace.');
  } else if (mom.bucket === 'steady') {
    tooltipLines.push('');
    tooltipLines.push('Why steady: Regular uploads with no');
    tooltipLines.push('major pace change recently.');
  } else if (mom.bucket === 'low-signal') {
    tooltipLines.push('');
    tooltipLines.push('Why insufficient: Fewer than 4 videos');
    tooltipLines.push('found — not enough data to judge pace.');
  }

  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: big ? '3px 8px' : '2px 6px',
        borderRadius: 3, background: tone.bg, color: tone.c,
        fontSize: big ? 11 : 10, fontWeight: 600, letterSpacing: '0.02em',
        fontFamily: 'var(--font-mono)',
        position: 'relative', cursor: 'default',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={{ fontSize: big ? 11 : 9, lineHeight: 1 }}>{m.glyph}</span>
      <span style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>{m.label}</span>
      {sparkline && trend.length > 0 && (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
          <polyline
            points={trend.map((v, i) => {
              const x = (i / (trend.length - 1)) * w;
              const y = v == null ? h / 2 : h - 1 - ((v / max) * (h - 2));
              return `${x},${y}`;
            }).join(' ')}
            fill="none" stroke={tone.c} strokeWidth="1"
            strokeLinecap="round" strokeLinejoin="round" opacity="0.85"
          />
        </svg>
      )}

      {/* Hover tooltip */}
      {hovered && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%',
          transform: 'translateX(-50%)',
          padding: '10px 14px', background: 'var(--ink)', color: 'var(--bg)',
          borderRadius: 8, fontSize: 11, lineHeight: 1.55,
          whiteSpace: 'pre', zIndex: 999,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          pointerEvents: 'none', minWidth: 220,
          fontFamily: 'var(--font-mono)', fontWeight: 400,
          letterSpacing: '0.01em',
        }}>
          {tooltipLines.join('\n')}
          {/* Arrow */}
          <div style={{
            position: 'absolute', top: '100%', left: '50%',
            transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '6px solid var(--ink)',
          }} />
        </div>
      )}
    </span>
  );
}

/**
 * Compute a basic momentum object from video publish dates.
 * videoTimestamps = array of ISO date strings for recent videos
 */
export function computeMomentum(videoTimestamps = []) {
  if (!videoTimestamps || videoTimestamps.length === 0) {
    return { bucket: 'low-signal', last30: null, prior90: null, trend: [], lastUpload: '?' };
  }

  const now = Date.now();
  const DAY = 86400000;
  const dates = videoTimestamps.map(d => new Date(d).getTime()).filter(t => !isNaN(t)).sort((a, b) => b - a);

  if (dates.length === 0) {
    return { bucket: 'low-signal', last30: null, prior90: null, trend: [], lastUpload: '?' };
  }

  const lastUploadMs = now - dates[0];
  let lastUpload;
  if (lastUploadMs < DAY) lastUpload = 'today';
  else if (lastUploadMs < 2 * DAY) lastUpload = '1d';
  else if (lastUploadMs < 7 * DAY) lastUpload = Math.floor(lastUploadMs / DAY) + 'd';
  else if (lastUploadMs < 30 * DAY) lastUpload = Math.floor(lastUploadMs / (7 * DAY)) + 'w';
  else if (lastUploadMs < 365 * DAY) lastUpload = Math.floor(lastUploadMs / (30 * DAY)) + 'mo';
  else lastUpload = '>1y';

  const last30 = dates.filter(d => now - d < 30 * DAY).length;
  const prior90 = dates.filter(d => now - d >= 30 * DAY && now - d < 120 * DAY).length;

  // Build 12-week trend (most recent 12 weeks)
  const trend = [];
  for (let w = 11; w >= 0; w--) {
    const weekStart = now - (w + 1) * 7 * DAY;
    const weekEnd = now - w * 7 * DAY;
    trend.push(dates.filter(d => d >= weekStart && d < weekEnd).length);
  }

  // Determine bucket
  let bucket;
  if (last30 === 0 && lastUploadMs > 60 * DAY) bucket = 'dormant';
  else if (last30 === 0) bucket = 'slowing';
  else if (dates.length < 4) bucket = 'low-signal';
  else {
    const recentHalf = trend.slice(6).reduce((s, v) => s + v, 0);
    const olderHalf = trend.slice(0, 6).reduce((s, v) => s + v, 0);
    if (recentHalf > olderHalf * 1.3) bucket = 'accelerating';
    else if (recentHalf < olderHalf * 0.6) bucket = 'slowing';
    else if (last30 >= 4) bucket = 'active';
    else bucket = 'steady';
  }

  return { bucket, last30, prior90, trend, lastUpload };
}
