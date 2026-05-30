'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Topbar from '@/components/Topbar';
import Sidebar from '@/components/Sidebar';
import Rosette from '@/components/Rosette';
import { getActiveGates, DEFAULT_DIMENSION_WEIGHTS, saveGateOverrides, loadGateOverrides } from '@/config/gates';
import { getScoutHistory, getDossiers, getCategoryCounts, clearResultsActive, getPastCreatorsForSearch } from '@/lib/scoutHistory';

const CATEGORIES = [
  'Beard Oil & Beard Care',
  'Face Wash & Face Care',
  'Hair Styling & Hair Care',
  "Men's Grooming (General)",
  'Skincare & Serums',
  'Deodorants & Perfumes',
  'Home Care & Air Fresheners',
];

const CONTENT_TYPES = [
  'Reviews', 'Tutorials', 'Hauls', 'Routine', 'Comparisons', 'UGC mention',
];

const LANGUAGES = [
  { k: 'EN', n: 'English' },   { k: 'HI', n: 'Hindi' },
  { k: 'TA', n: 'Tamil' },     { k: 'TE', n: 'Telugu' },
  { k: 'KN', n: 'Kannada' },   { k: 'BN', n: 'Bengali' },
  { k: 'MR', n: 'Marathi' },   { k: 'GU', n: 'Gujarati' },
  { k: 'ML', n: 'Malayalam' },  { k: 'PA', n: 'Punjabi' },
  { k: 'OR', n: 'Odia' },      { k: 'HG', n: 'Hinglish' },
];

const LANG_MAP = {
  EN: 'English', HI: 'Hindi', TA: 'Tamil', TE: 'Telugu', KN: 'Kannada',
  BN: 'Bengali', MR: 'Marathi', GU: 'Gujarati', ML: 'Malayalam',
  PA: 'Punjabi', OR: 'Odia', HG: 'Mixed / Hinglish',
};

const SUBSCRIBER_TIERS = [
  { value: '1000-10000', label: 'Nano · 1K–10K' },
  { value: '10000-100000', label: 'Micro · 10K–100K' },
  { value: '100000-500000', label: 'Mid · 100K–500K' },
  { value: '500000-10000000', label: 'Macro · 500K+' },
];

const VIDEO_FORMATS = ['All formats', 'Long-form', 'Shorts'];
const RESULT_COUNTS = [5, 10, 15, 20, 30, 50];

export default function LandingPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  // Form state
  const [category, setCategory] = useState('Skincare & Serums');
  const [platform, setPlatform] = useState('youtube');
  const [subscriberTier, setSubscriberTier] = useState('10000-100000');
  const [videoFormat, setVideoFormat] = useState('All formats');
  const [resultCount, setResultCount] = useState(20);
  const [contentTypes, setContentTypes] = useState(new Set(['Reviews', 'Tutorials', 'Hauls']));
  const [selectedLangs, setSelectedLangs] = useState(new Set(['EN', 'HI', 'HG']));
  const [running, setRunning] = useState(false);
  const [pastCount, setPastCount] = useState(0);
  const [excludePast, setExcludePast] = useState(true);
  const [geoGate, setGeoGate] = useState(true);
  const [weights, setWeights] = useState({ ...DEFAULT_DIMENSION_WEIGHTS });

  // Session counter
  const [runNumber, setRunNumber] = useState(1);

  useEffect(() => {
    setMounted(true);
    clearResultsActive();
    // Load saved gate config
    const gates = getActiveGates();
    setGeoGate(gates.geographyGateEnabled !== false);
    if (gates.dimensionWeights) setWeights(gates.dimensionWeights);
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('scoutSessionLog_v1');
      const log = raw ? JSON.parse(raw) : { entries: [] };
      setRunNumber((log.entries?.length || 0) + 1);
    } catch {}
  }, []);

  // Track past-creator count as category/platform changes
  useEffect(() => {
    if (!mounted) return;
    const matches = getPastCreatorsForSearch(category, platform);
    setPastCount(matches.length);
  }, [mounted, category, platform]);

  const toggleContentType = (ct) => {
    setContentTypes(prev => {
      const next = new Set(prev);
      next.has(ct) ? next.delete(ct) : next.add(ct);
      return next;
    });
  };

  const toggleLang = (k) => {
    setSelectedLangs(prev => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  };

  const onRun = () => {
    if (selectedLangs.size === 0) { alert('Select at least one language.'); return; }
    const activeKeys = WEIGHT_KEYS.filter(k => (weights[k] || 0) > 0);
    if (activeKeys.length === 0) { alert('Enable at least one dimension.'); return; }

    // Auto-normalize weights if they don't sum to 100%
    let runWeights = weights;
    const wSum = Object.values(weights).reduce((s, v) => s + v, 0);
    if (wSum !== 100) {
      runWeights = normalizeWeights(weights);
      setWeights(runWeights);
    }

    setRunning(true);

    // Persist gate overrides (normalized weights + geo gate)
    try {
      const current = loadGateOverrides() || {};
      current.geographyGateEnabled = geoGate;
      current.dimensionWeights = runWeights;
      saveGateOverrides(current);
    } catch {}

    const languages = [...selectedLangs].map(k => LANG_MAP[k] || k);
    const formData = {
      category,
      platform,
      subscriberRange: subscriberTier,
      videoFormat: videoFormat === 'All formats' ? 'any' : videoFormat.toLowerCase(),
      maxResults: resultCount,
      contentType: [...contentTypes],
      languages,
      brandContext: '',
      excludePast: pastCount > 0 ? excludePast : false,
    };

    // Session tracking
    try {
      const raw = sessionStorage.getItem('scoutSessionLog_v1');
      const log = raw ? JSON.parse(raw) : { entries: [] };
      const lastEntry = log.entries[log.entries.length - 1];
      const vol = lastEntry ? lastEntry.vol : 1;
      const no = lastEntry ? lastEntry.no + 1 : 1;
      log.entries.push({
        vol, no, category, platform, count: resultCount,
        languages, ts: new Date().toISOString(),
      });
      sessionStorage.setItem('scoutSessionLog_v1', JSON.stringify(log));
    } catch {}

    sessionStorage.setItem('scoutPendingSearch', JSON.stringify(formData));
    router.push('/processing');
  };

  const inputStyle = {
    height: 32, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 6,
    fontSize: 13, color: 'var(--ink)', background: 'var(--surface)',
    fontFamily: 'inherit', outline: 'none', appearance: 'none', width: '100%',
  };

  const chipStyle = (on) => ({
    padding: '5px 10px', borderRadius: 5, fontSize: 12, fontWeight: on ? 500 : 400,
    border: '1px solid ' + (on ? 'var(--ink)' : 'var(--line)'),
    background: on ? 'var(--ink)' : 'var(--surface)',
    color: on ? 'var(--bg)' : 'var(--ink-2)',
    cursor: 'pointer', fontFamily: 'inherit',
  });

  if (!mounted) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Topbar />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <LandingSidebar />
        <main style={{ flex: 1, overflow: 'auto' }}>
          {/* Header */}
          <div style={{ padding: '20px 28px 18px', borderBottom: '1px solid var(--line)' }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>
              New scout · run #{runNumber.toLocaleString()}
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
              Brief
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 2 }}>
              Define the search. Engine returns ranked creators in ~50 seconds.
            </div>
          </div>

          {/* Form + Recent scouts grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr' }}>
            {/* Form */}
            <div style={{
              padding: '22px 28px', borderRight: '1px solid var(--line)',
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px 14px',
            }}>
              {/* Category */}
              <Field label="Category" hint="required" span={3}>
                <select style={inputStyle} value={category} onChange={e => setCategory(e.target.value)}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>

              {/* Platform */}
              <Field label="Platform" span={3}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[['youtube', 'YouTube'], ['instagram', 'Instagram'], ['both', 'Both']].map(([v, l]) => (
                    <button key={v} type="button" style={chipStyle(platform === v)} onClick={() => setPlatform(v)}>
                      {l}
                    </button>
                  ))}
                </div>
              </Field>

              {/* Subscriber tier */}
              <Field label="Subscriber tier">
                <select style={inputStyle} value={subscriberTier} onChange={e => setSubscriberTier(e.target.value)}>
                  {SUBSCRIBER_TIERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>

              {/* Video format */}
              <Field label="Video format">
                <select style={inputStyle} value={videoFormat} onChange={e => setVideoFormat(e.target.value)}>
                  {VIDEO_FORMATS.map(f => <option key={f}>{f}</option>)}
                </select>
              </Field>

              {/* Result count */}
              <Field label="Result count">
                <select style={inputStyle} value={resultCount} onChange={e => setResultCount(Number(e.target.value))}>
                  {RESULT_COUNTS.map(c => <option key={c} value={c}>{c} creators</option>)}
                </select>
              </Field>

              {/* Content type */}
              <Field label="Content type" hint="multi-select" span={3}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {CONTENT_TYPES.map(ct => (
                    <button
                      key={ct} type="button"
                      style={chipStyle(contentTypes.has(ct))}
                      onClick={() => toggleContentType(ct)}
                    >{ct}</button>
                  ))}
                </div>
              </Field>

              {/* Languages */}
              <Field
                label="Languages"
                hint={`${selectedLangs.size} selected · ${LANGUAGES.length} available`}
                span={3}
              >
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {LANGUAGES.map(l => (
                    <button
                      key={l.k} type="button"
                      style={chipStyle(selectedLangs.has(l.k))}
                      onClick={() => toggleLang(l.k)}
                    >
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 11, marginRight: 4, opacity: 0.6,
                      }}>{l.k}</span>{l.n}
                    </button>
                  ))}
                </div>
              </Field>
            </div>

            {/* Right: PCF Model Controls */}
            <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto' }}>
              <ModelControls
                weights={weights}
                onWeightsChange={setWeights}
                geoGate={geoGate}
                onGeoGateChange={setGeoGate}
              />
            </div>
          </div>

          {/* Past-creator dedup prompt */}
          {pastCount > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '12px 28px', borderTop: '1px solid var(--line)',
              background: 'var(--surface)',
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: 999,
                background: 'var(--accent)', flexShrink: 0,
              }} />
              <div style={{ flex: 1, fontSize: 12.5, color: 'var(--ink-2)' }}>
                <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{pastCount}</span>{' '}
                creator{pastCount !== 1 ? 's' : ''} previously scouted in this category.
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setExcludePast(true)}
                  style={{
                    padding: '4px 10px', borderRadius: 5, fontSize: 11.5, fontWeight: excludePast ? 500 : 400,
                    border: '1px solid ' + (excludePast ? 'var(--ink)' : 'var(--line)'),
                    background: excludePast ? 'var(--ink)' : 'var(--surface)',
                    color: excludePast ? 'var(--bg)' : 'var(--ink-2)',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >Exclude past</button>
                <button
                  type="button"
                  onClick={() => setExcludePast(false)}
                  style={{
                    padding: '4px 10px', borderRadius: 5, fontSize: 11.5, fontWeight: !excludePast ? 500 : 400,
                    border: '1px solid ' + (!excludePast ? 'var(--ink)' : 'var(--line)'),
                    background: !excludePast ? 'var(--ink)' : 'var(--surface)',
                    color: !excludePast ? 'var(--bg)' : 'var(--ink-2)',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >Include all</button>
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            padding: '18px 28px', borderTop: '1px solid var(--line)',
            gap: 8,
          }}>
            <button
              type="button"
              onClick={onRun}
              disabled={running}
              style={{
                height: 32, padding: '0 16px', borderRadius: 6, border: 'none',
                background: running ? 'var(--muted)' : 'var(--accent)',
                color: 'var(--accent-ink)', fontWeight: 500, fontSize: 13,
                cursor: running ? 'not-allowed' : 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'inherit',
              }}
            >
              {running ? 'Running…' : 'Run scout'}{' '}
              <span style={{ fontSize: 11, opacity: 0.7 }}>↵</span>
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}

/** Landing sidebar — "New scout" highlighted, categories link to history */
function LandingSidebar() {
  const router = useRouter();
  const [historyCount, setHistoryCount] = useState(0);
  const [dossierCount, setDossierCount] = useState(0);
  const [catCounts, setCatCounts] = useState({});

  useEffect(() => {
    setHistoryCount(getScoutHistory().length);
    setDossierCount(getDossiers().length);
    setCatCounts(getCategoryCounts());
  }, []);

  const CATEGORY_ITEMS = [
    { label: 'Beard care', full: 'Beard Oil & Beard Care' },
    { label: 'Face care', full: 'Face Wash & Face Care' },
    { label: 'Skincare', full: 'Skincare & Serums' },
    { label: 'Hair', full: 'Hair Styling & Hair Care' },
    { label: 'Grooming', full: "Men's Grooming (General)" },
    { label: 'Fragrance', full: 'Deodorants & Perfumes' },
    { label: 'Home care', full: 'Home Care & Air Fresheners' },
  ];

  // v3.0 — geography gate replaces Bharat floor

  return (
    <aside style={{
      width: 220, borderRight: '1px solid var(--line)', background: 'var(--surface)',
      padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 2,
      overflow: 'auto', flexShrink: 0,
    }}>
      {/* Workspace group */}
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
        padding: '10px 8px 6px', fontWeight: 500,
      }}>Workspace</div>
      <SidebarItem label="New scout" icon="+" active onClick={() => router.push('/')} />
      <SidebarItem label="Recent scouts" count={historyCount || null} onClick={() => router.push('/history')} />
      <SidebarItem label="My dossiers" count={dossierCount || null} onClick={() => router.push('/dossiers')} />

      {/* Categories — navigate to history filtered by category */}
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
        padding: '10px 8px 6px', fontWeight: 500, marginTop: 4,
      }}>Categories</div>
      {CATEGORY_ITEMS.map(({ label, full }) => {
        const count = catCounts[full] || 0;
        return (
          <SidebarItem
            key={label}
            label={label}
            count={count > 0 ? count : null}
            onClick={() => router.push('/history?category=' + encodeURIComponent(full))}
          />
        );
      })}

      <div style={{ flex: 1 }} />
      <div style={{
        padding: '10px 8px', fontSize: 11, color: 'var(--faint)',
        fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
      }}>v3.0 · PCF + Geo gate</div>
    </aside>
  );
}

function SidebarItem({ label, icon, count, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '5px 8px', borderRadius: 5, fontSize: 12.5,
        cursor: onClick ? 'pointer' : 'default',
        color: active ? 'var(--ink)' : 'var(--ink-2)',
        background: active ? 'var(--surface-2)' : 'transparent',
        fontWeight: active ? 500 : 400,
        display: 'flex', alignItems: 'center', gap: 8,
      }}
    >
      <span style={{
        width: 14,
        color: icon === '+' ? 'var(--accent)' : 'var(--faint)',
        fontFamily: 'var(--font-mono)',
      }}>
        {icon === '+' ? '◆' : '—'}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      {count && (
        <span style={{
          fontSize: 10.5, color: 'var(--faint)',
          fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
        }}>{count}</span>
      )}
    </div>
  );
}

function Field({ label, hint, children, span = 1 }) {
  return (
    <div style={{ gridColumn: `span ${span}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{
        fontSize: 11, color: 'var(--ink-2)', fontWeight: 500,
        display: 'flex', justifyContent: 'space-between',
      }}>
        <span>{label}</span>
        {hint && <span style={{ color: 'var(--muted)', fontWeight: 400 }}>{hint}</span>}
      </label>
      {children}
    </div>
  );
}

const WEIGHT_KEYS = ['engagement_quality', 'reach_relevance', 'growth_potential', 'parasocial_depth', 'brand_fit'];
const WEIGHT_LABELS = {
  engagement_quality: 'Engagement',
  reach_relevance: 'Reach',
  growth_potential: 'Growth',
  parasocial_depth: 'Parasocial',
  brand_fit: 'Brand Fit',
};
const WEIGHT_SHORT = ['Eng', 'Reach', 'Grw', 'Para', 'Fit'];

/** Normalize weights so active dims sum to exactly 100%. Inactive dims stay 0. */
function normalizeWeights(weights) {
  const activeKeys = WEIGHT_KEYS.filter(k => (weights[k] || 0) > 0);
  if (activeKeys.length === 0) return weights;

  const sum = activeKeys.reduce((s, k) => s + (weights[k] || 0), 0);
  if (sum === 0) return weights;
  if (sum === 100) return weights;

  // Calculate raw proportions and floor them
  const out = {};
  WEIGHT_KEYS.forEach(k => { out[k] = 0; });

  const remainders = [];
  let roundedSum = 0;

  for (const k of activeKeys) {
    const raw = (weights[k] / sum) * 100;
    const floored = Math.floor(raw);
    out[k] = floored;
    roundedSum += floored;
    remainders.push({ key: k, frac: raw - floored });
  }

  // Distribute leftover points to dims with largest fractional parts
  remainders.sort((a, b) => b.frac - a.frac);
  let deficit = 100 - roundedSum;
  for (let i = 0; i < deficit && i < remainders.length; i++) {
    out[remainders[i].key]++;
  }

  return out;
}

function ModelControls({ weights, onWeightsChange, geoGate, onGeoGateChange }) {
  const wSum = WEIGHT_KEYS.reduce((s, k) => s + (weights[k] || 0), 0);
  const isValid = wSum === 100;

  // Rosette preview: use actual weight values so donut/radar reflects real percentages
  const previewValues = WEIGHT_KEYS.map(k => weights[k] || 0);
  const previewWeights = WEIGHT_KEYS.map(k => weights[k]);
  const activeLabels = WEIGHT_KEYS.map((k) => weights[k] > 0 ? WEIGHT_LABELS[k] : null).filter(Boolean);
  const rosetteLabels = WEIGHT_KEYS.map((_, i) => WEIGHT_SHORT[i]);

  const activeCount = WEIGHT_KEYS.filter(k => weights[k] > 0).length;
  const canNormalize = !isValid && activeCount > 0 && wSum > 0;

  const handleSlider = (key, val) => {
    onWeightsChange({ ...weights, [key]: val });
  };

  const handleType = (key, raw) => {
    // Allow empty input (treat as 0)
    if (raw === '' || raw === '-') {
      onWeightsChange({ ...weights, [key]: 0 });
      return;
    }
    const parsed = parseInt(raw, 10);
    if (isNaN(parsed)) return;
    const clamped = Math.max(0, Math.min(100, parsed));
    onWeightsChange({ ...weights, [key]: clamped });
  };

  const handleNormalize = () => {
    onWeightsChange(normalizeWeights(weights));
  };

  const handleReset = () => {
    onWeightsChange({ ...DEFAULT_DIMENSION_WEIGHTS });
  };

  return (
    <>
      {/* Header + Rosette preview */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>PCF Model</div>
        <div style={{
          display: 'flex', gap: 18, alignItems: 'center',
          padding: '14px 16px', border: '1px solid var(--line)', borderRadius: 8,
          background: 'var(--bg)',
        }}>
          <Rosette
            values={previewValues}
            weights={previewWeights}
            size={110}
            labels={rosetteLabels}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 3, lineHeight: 1.4 }}>
              {activeLabels.join(' · ') || 'No dimensions'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.5 }}>
              {activeCount} dimension{activeCount !== 1 ? 's' : ''} active
            </div>
            <div style={{
              marginTop: 6, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{
                fontSize: 11, fontFamily: 'var(--font-mono)',
                fontWeight: 600, color: isValid ? 'var(--accent)' : 'var(--danger)',
              }}>
                {wSum}%
              </span>
              {canNormalize && (
                <button
                  type="button"
                  onClick={handleNormalize}
                  style={{
                    fontSize: 10, fontWeight: 500, color: '#fff',
                    background: 'var(--accent)', border: 'none', borderRadius: 4,
                    padding: '2px 8px', cursor: 'pointer', fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.02em',
                  }}
                >Normalize to 100%</button>
              )}
              {isValid && (
                <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                  ✓ ready
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Geography gate */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', border: '1px solid var(--line)', borderRadius: 6,
        background: 'var(--bg)',
      }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)' }}>Geography gate</div>
          <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 1 }}>
            {geoGate ? 'India-only · non-India creators rejected' : 'Off · all geographies pass'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onGeoGateChange(!geoGate)}
          style={{
            position: 'relative', width: 36, height: 20, borderRadius: 999, border: 'none',
            background: geoGate ? 'var(--accent)' : 'var(--line)', cursor: 'pointer',
            transition: 'background 0.15s', flexShrink: 0,
          }}
        >
          <span style={{
            position: 'absolute', top: 2,
            left: geoGate ? 18 : 2,
            width: 16, height: 16, borderRadius: 999,
            background: '#fff', transition: 'left 0.15s',
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
          }} />
        </button>
      </div>

      {/* Dimension weight sliders */}
      <div style={{
        border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden',
        background: 'var(--bg)',
      }}>
        <div style={{
          padding: '8px 14px', background: 'var(--surface-2)',
          borderBottom: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)',
            textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500,
          }}>Dimension weights</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {canNormalize && (
              <button
                type="button"
                onClick={handleNormalize}
                style={{
                  fontSize: 10, color: 'var(--accent)', background: 'transparent',
                  border: '1px solid var(--accent)', borderRadius: 4,
                  padding: '2px 7px', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >Normalize</button>
            )}
            <button
              type="button"
              onClick={handleReset}
              style={{
                fontSize: 10, color: 'var(--ink-2)', background: 'transparent',
                border: '1px solid var(--line)', borderRadius: 4,
                padding: '2px 7px', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >Reset</button>
          </div>
        </div>

        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {WEIGHT_KEYS.map(k => {
            const v = weights[k] || 0;
            const isOff = v === 0;
            return (
              <div key={k} style={{ opacity: isOff ? 0.45 : 1, transition: 'opacity 0.15s' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 11.5, color: isOff ? 'var(--muted)' : 'var(--ink)', fontWeight: isOff ? 400 : 500 }}>
                    {WEIGHT_LABELS[k]}
                    {isOff && <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--danger)', fontFamily: 'var(--font-mono)' }}>OFF</span>}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={v}
                      onChange={e => handleType(k, e.target.value)}
                      style={{
                        width: 48, height: 20, padding: '0 4px',
                        border: '1px solid var(--line)', borderRadius: 4,
                        fontSize: 11, fontWeight: 600,
                        fontFamily: 'var(--font-mono)',
                        color: isOff ? 'var(--muted)' : 'var(--ink)',
                        background: 'var(--surface)',
                        textAlign: 'right', outline: 'none',
                        fontVariantNumeric: 'tabular-nums',
                        MozAppearance: 'textfield',
                      }}
                    />
                    <span style={{
                      fontSize: 10, color: 'var(--muted)',
                      fontFamily: 'var(--font-mono)', fontWeight: 500,
                    }}>%</span>
                  </div>
                </div>
                <input
                  type="range" min={0} max={100} step={1}
                  value={v}
                  onChange={e => handleSlider(k, parseInt(e.target.value, 10))}
                  style={{ width: '100%', accentColor: isOff ? 'var(--muted)' : 'var(--accent)', height: 4 }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
