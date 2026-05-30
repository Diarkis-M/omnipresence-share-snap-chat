'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Topbar from '@/components/Topbar';
import Sidebar from '@/components/Sidebar';
import Rosette from '@/components/Rosette';
import { getAggregatedCreators, getScoutHistory } from '@/lib/scoutHistory';
import { getActiveGates, DEFAULT_DIMENSION_WEIGHTS } from '@/config/gates';

// ── Constants ──

const CAT_TO_SIDEBAR = {
  'Beard Oil & Beard Care': 'Beard care',
  'Face Wash & Face Care': 'Face care',
  'Hair Styling & Hair Care': 'Hair',
  "Men's Grooming (General)": 'Grooming',
  'Skincare & Serums': 'Skincare',
  'Deodorants & Perfumes': 'Fragrance',
  'Home Care & Air Fresheners': 'Home care',
};

const PLATFORM_OPTIONS = ['All', 'YouTube', 'Instagram'];
const TIER_OPTIONS = [
  { value: 'All', label: 'All tiers' },
  { value: 'nano', label: 'Nano (1K–10K)' },
  { value: 'micro', label: 'Micro (10K–100K)' },
  { value: 'mid', label: 'Mid (100K–500K)' },
  { value: 'macro', label: 'Macro (500K+)' },
];

const DIM_KEYS = [
  'reach_relevance', 'engagement_quality', 'parasocial_depth',
  'brand_fit', 'growth_potential',
];

// ── Helpers ──

function tierForSubs(count) {
  if (!count || count < 1000) return 'nano';
  if (count < 10000) return 'nano';
  if (count < 100000) return 'micro';
  if (count < 500000) return 'mid';
  return 'macro';
}

function formatSubs(count) {
  if (!count) return '—';
  if (count >= 1e6) return (count / 1e6).toFixed(1) + 'M';
  if (count >= 1000) return Math.round(count / 1000) + 'K';
  return String(count);
}

function initial(name = '') {
  const m = name.trim().match(/\S/);
  return (m ? m[0] : '?').toUpperCase();
}

function dimScore(analysis, key) {
  const s = analysis?.pcf_score?.[key]?.score;
  return typeof s === 'number' ? Math.round(s) : 0;
}

// ── Page shell with Suspense (useSearchParams) ──

export default function CategoryPage() {
  return (
    <Suspense fallback={null}>
      <CategoryContent />
    </Suspense>
  );
}

// ── Filter chip ──

function FilterChip({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 10px', borderRadius: 5, fontSize: 12,
        fontWeight: active ? 500 : 400,
        border: '1px solid ' + (active ? 'var(--ink)' : 'var(--line)'),
        background: active ? 'var(--ink)' : 'var(--surface)',
        color: active ? 'var(--bg)' : 'var(--ink-2)',
        cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
      }}
    >{label}</button>
  );
}

// ── Main content ──

function CategoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const category = searchParams.get('cat') || '';
  const sidebarLabel = CAT_TO_SIDEBAR[category] || category.split('&')[0].trim();

  const [mounted, setMounted] = useState(false);
  const [creators, setCreators] = useState([]);
  const [runCount, setRunCount] = useState(0);
  const [platformFilter, setPlatformFilter] = useState('All');
  const [tierFilter, setTierFilter] = useState('All');
  const [dimWeights, setDimWeights] = useState(DEFAULT_DIMENSION_WEIGHTS);

  useEffect(() => {
    setMounted(true);
    setCreators(getAggregatedCreators(category));
    setRunCount(
      getScoutHistory().filter(s => s.criteria?.category === category).length
    );
    const g = getActiveGates();
    if (g.dimensionWeights) setDimWeights(g.dimensionWeights);
  }, [category]);

  // ── Derived: filter + sort ──

  const filtered = useMemo(() => {
    let list = [...creators];

    if (platformFilter !== 'All') {
      const plat = platformFilter.toLowerCase();
      list = list.filter(c => c.platform === plat);
    }

    if (tierFilter !== 'All') {
      list = list.filter(c => tierForSubs(c.subscriberCount) === tierFilter);
    }

    list.sort((a, b) => b.pcf - a.pcf);
    return list;
  }, [creators, platformFilter, tierFilter]);

  if (!mounted) return null;

  const rosetteWeights = DIM_KEYS.map(k => dimWeights[k] || 0);

  // ── Render ──

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Topbar />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Sidebar section="workspace" active={sidebarLabel} />
        <main style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>

          {/* ── Header ── */}
          <div className="eyebrow">Category</div>
          <div style={{
            fontSize: 22, fontWeight: 600, marginTop: 2,
            letterSpacing: '-0.02em', color: 'var(--ink)',
          }}>
            {category || 'All categories'}
          </div>
          <div style={{
            fontSize: 13, color: 'var(--ink-2)', marginTop: 4, marginBottom: 20,
          }}>
            {creators.length} unique creator{creators.length !== 1 ? 's' : ''} from{' '}
            {runCount} run{runCount !== 1 ? 's' : ''}
          </div>

          {/* ── Filter bar ── */}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 10,
            padding: '14px 0', marginBottom: 16,
            borderBottom: '1px solid var(--line)',
          }}>
            {/* Platform */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={filterLabelStyle}>Platform</span>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {PLATFORM_OPTIONS.map(opt => (
                  <FilterChip
                    key={opt} label={opt}
                    active={platformFilter === opt}
                    onClick={() => setPlatformFilter(opt)}
                  />
                ))}
              </div>
            </div>
            {/* Tier */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={filterLabelStyle}>Tier</span>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {TIER_OPTIONS.map(opt => (
                  <FilterChip
                    key={opt.value} label={opt.label}
                    active={tierFilter === opt.value}
                    onClick={() => setTierFilter(opt.value)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* ── Empty state ── */}
          {filtered.length === 0 && (
            <div style={{
              border: '1px solid var(--line)', borderRadius: 10,
              padding: '40px 32px', textAlign: 'center', maxWidth: 420,
              margin: '20px auto', background: 'var(--surface)',
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: 'var(--surface-2)', display: 'grid',
                placeItems: 'center', margin: '0 auto 14px',
                fontSize: 18, color: 'var(--muted)',
              }}>&#9671;</div>
              <div style={{
                fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 6,
              }}>
                {creators.length === 0
                  ? 'No creators scouted yet'
                  : 'No creators match filters'}
              </div>
              <div style={{
                fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5, marginBottom: 18,
              }}>
                {creators.length === 0
                  ? 'Run a scout for this category and creators will appear here across all runs.'
                  : 'Try adjusting the platform or tier filter.'}
              </div>
              {creators.length === 0 && (
                <button
                  onClick={() => router.push('/')}
                  style={{
                    height: 32, padding: '0 16px', borderRadius: 6, border: 'none',
                    background: 'var(--accent)', color: 'var(--accent-ink)',
                    fontWeight: 500, fontSize: 13, cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >New scout</button>
              )}
            </div>
          )}

          {/* ── Creator list ── */}
          {filtered.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {/* Header row */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '32px 28px 1fr 44px 68px 54px',
                gap: 8, padding: '8px 0',
                borderBottom: '1px solid var(--line)',
                alignItems: 'center',
              }}>
                <span style={headerCell}>#</span>
                <span style={headerCell} />
                <span style={headerCell}>Creator</span>
                <span style={{ ...headerCell, textAlign: 'center' }}>Plat.</span>
                <span style={{ ...headerCell, textAlign: 'right' }}>Subs</span>
                <span style={{ ...headerCell, textAlign: 'right' }}>PCF</span>
              </div>

              {/* Data rows */}
              {filtered.map((c, idx) => {
                const rosetteVals = DIM_KEYS.map(k => dimScore(c.analysis, k));
                const platColor = c.platform === 'instagram'
                  ? { bg: '#E1306C18', fg: '#E1306C' }
                  : { bg: '#FF000014', fg: '#c00' };

                return (
                  <div
                    key={c.platform + ':' + c.channelId}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '32px 28px 1fr 44px 68px 54px',
                      gap: 8, padding: '10px 0',
                      borderBottom: '1px solid var(--line-2)',
                      alignItems: 'center',
                    }}
                  >
                    {/* Rank */}
                    <span style={{
                      fontSize: 11, fontFamily: 'var(--font-mono)',
                      color: 'var(--muted)', textAlign: 'center',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {idx + 1}
                    </span>

                    {/* Rosette */}
                    <Rosette values={rosetteVals} weights={rosetteWeights} size={28} />

                    {/* Name + run count */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 500, color: 'var(--ink)',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {c.channelName}
                      </div>
                      {c.runCount > 1 && (
                        <div style={{
                          fontSize: 10, color: 'var(--muted)',
                          fontFamily: 'var(--font-mono)',
                        }}>
                          appeared {c.runCount}x
                        </div>
                      )}
                    </div>

                    {/* Platform badge */}
                    <div style={{ textAlign: 'center' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 500,
                        padding: '2px 6px', borderRadius: 3,
                        background: platColor.bg, color: platColor.fg,
                        fontFamily: 'var(--font-mono)',
                      }}>
                        {c.platform === 'instagram' ? 'IG' : 'YT'}
                      </span>
                    </div>

                    {/* Subscribers */}
                    <span style={{
                      fontSize: 12, fontFamily: 'var(--font-mono)',
                      color: 'var(--ink-2)', textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {formatSubs(c.subscriberCount)}
                    </span>

                    {/* PCF score */}
                    <span style={{
                      fontSize: 14, fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                      color: c.pcf >= 70 ? 'var(--accent)' : c.pcf >= 40 ? 'var(--ink)' : 'var(--muted)',
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {c.pcf}
                    </span>
                  </div>
                );
              })}

              {/* Summary footer */}
              <div style={{
                padding: '14px 0 8px', fontSize: 11, color: 'var(--muted)',
                fontFamily: 'var(--font-mono)',
              }}>
                {filtered.length} creator{filtered.length !== 1 ? 's' : ''}
                {(platformFilter !== 'All' || tierFilter !== 'All') && ' (filtered)'}
                {' · sorted by PCF score'}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ── Shared inline styles ──

const filterLabelStyle = {
  fontSize: 11, fontWeight: 500, color: 'var(--muted)',
  fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
  letterSpacing: '0.06em', minWidth: 72,
};

const headerCell = {
  fontSize: 10, fontWeight: 500, color: 'var(--muted)',
  fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
  letterSpacing: '0.06em',
};
