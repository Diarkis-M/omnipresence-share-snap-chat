'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Topbar from '@/components/Topbar';
import Sidebar from '@/components/Sidebar';
import Rosette from '@/components/Rosette';
import MomentumChip from '@/components/MomentumChip';
import { getActiveGates, DEFAULT_DIMENSION_WEIGHTS } from '@/config/gates';
import { isResultsActive, clearResultsActive } from '@/lib/scoutHistory';

function initial(name = '') {
  const m = name.trim().match(/\S/);
  return (m ? m[0] : '?').toUpperCase();
}
function formatSubs(count, platform) {
  if (!count) return '—';
  const k = count >= 1e6 ? `${(count / 1e6).toFixed(1)}M` : count >= 1000 ? `${Math.round(count / 1000)}K` : String(count);
  return `${k}`;
}
function normalizeLang(lang) {
  if (!lang) return 'MIXED';
  if (lang === 'Mixed / Hinglish') return 'HG';
  return lang.toUpperCase().slice(0, 2);
}
function dimensionScore(analysis, key) {
  const s = analysis?.pcf_score?.[key]?.score;
  return typeof s === 'number' ? Math.round(s) : 0;
}
function compositeOverall(analysis) {
  const s = analysis?.pcf_score?.overall;
  if (typeof s === 'number') return Math.round(s);
  const w = getActiveGates().dimensionWeights || DEFAULT_DIMENSION_WEIGHTS;
  const reach = dimensionScore(analysis, 'reach_relevance');
  const eng = dimensionScore(analysis, 'engagement_quality');
  const para = dimensionScore(analysis, 'parasocial_depth');
  const brand = dimensionScore(analysis, 'brand_fit');
  const growth = dimensionScore(analysis, 'growth_potential');
  return Math.round(
    reach * (w.reach_relevance / 100) +
    eng * (w.engagement_quality / 100) +
    para * (w.parasocial_depth / 100) +
    brand * (w.brand_fit / 100) +
    growth * (w.growth_potential / 100)
  );
}

function pickReceipts(comments = [], n = 3) {
  return [...comments]
    .filter(c => typeof c === 'string' && c.trim().length >= 35)
    .map(c => c.replace(/<[^>]+>/g, '').trim())
    .sort((a, b) => b.length - a.length)
    .slice(0, n);
}

// Dimension key order matching the table columns: [Reach, Engagement, Parasocial, BrandFit, Growth]
const RESULT_DIM_KEYS = ['reach_relevance', 'engagement_quality', 'parasocial_depth', 'brand_fit', 'growth_potential'];

// Full dimension metadata for dynamic column rendering
const ALL_DIMS = [
  { key: 'reach_relevance', prop: 'reach', header: 'Reach', sortKey: 'reach', sortLabel: 'Reach', dossierLabel: 'Reach' },
  { key: 'engagement_quality', prop: 'eng', header: 'Engage.', sortKey: 'engagement', sortLabel: 'Engagement', dossierLabel: 'Engagement' },
  { key: 'parasocial_depth', prop: 'para', header: 'Para.', sortKey: 'parasocial', sortLabel: 'Parasocial', dossierLabel: 'Parasocial' },
  { key: 'brand_fit', prop: 'brand', header: 'Brand Fit', sortKey: 'brand', sortLabel: 'Brand Fit', dossierLabel: 'Brand Fit' },
  { key: 'growth_potential', prop: 'growth', header: 'Growth', sortKey: 'growth', sortLabel: 'Growth', dossierLabel: 'Growth' },
];

const smallBtn = {
  height: 28, padding: '0 11px', border: '1px solid var(--line)', borderRadius: 5,
  background: 'var(--surface)', fontSize: 12, color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'inherit',
};

export default function ResultsPage() {
  const router = useRouter();
  const [results, setResults] = useState([]);
  const [searchCriteria, setSearchCriteria] = useState(null);
  const [loading, setLoading] = useState(true);

  // Active dimension weights
  const [dimWeights, setDimWeights] = useState(DEFAULT_DIMENSION_WEIGHTS);
  useEffect(() => {
    const g = getActiveGates();
    if (g.dimensionWeights) setDimWeights(g.dimensionWeights);
  }, []);
  const resultWeightsArr = RESULT_DIM_KEYS.map(k => dimWeights[k] || 0);

  // Active dimensions — only these get table columns
  const activeDims = ALL_DIMS.filter(d => (dimWeights[d.key] || 0) > 0);
  const gridCols = ['28px', '1.4fr', '34px', '32px', '48px', '42px', '36px', ...activeDims.map(() => '1fr'), '1.6fr', '44px'].join(' ');

  // Interaction state
  const [sortBy, setSortBy] = useState('pcf');
  const [filterPlat, setFilterPlat] = useState('all');
  const [filterLang, setFilterLang] = useState('all');
  const [pinnedIds, setPinnedIds] = useState(() => new Set());
  const [hiddenIds, setHiddenIds] = useState(() => new Set());
  const [expandedId, setExpandedId] = useState(null);
  const [dossierOpen, setDossierOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [excludedCount, setExcludedCount] = useState(0);

  // Learnings
  const [learnings, setLearnings] = useState([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('scoutIrrelevantLearnings');
      setLearnings(raw ? JSON.parse(raw) : []);
    } catch {}
  }, []);
  const refreshLearnings = () => {
    try {
      const raw = localStorage.getItem('scoutIrrelevantLearnings');
      setLearnings(raw ? JSON.parse(raw) : []);
    } catch {}
  };

  // Load results — only if the active flag is set (fresh run or reopened from history)
  useEffect(() => {
    if (!isResultsActive()) {
      router.push('/');
      return;
    }
    try {
      const stored = localStorage.getItem('scoutResults');
      const criteria = localStorage.getItem('scoutSearchCriteria');
      if (!stored) { router.push('/'); return; }
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed) || parsed.length === 0) { router.push('/'); return; }

      const seen = new Set();
      const deduped = [];
      for (const r of parsed) {
        const idKey = `${r.platform || 'youtube'}:${r.channelId || ''}`;
        const nameKey = (r.channelName || '').replace(/\s+/g, '').toLowerCase();
        const key = idKey + '|' + nameKey;
        if (seen.has(key) || seen.has(nameKey)) continue;
        seen.add(key); seen.add(nameKey);
        deduped.push(r);
      }
      setResults(deduped);
      if (criteria) setSearchCriteria(JSON.parse(criteria));
      try {
        const meta = localStorage.getItem('scoutAnalysisMetadata');
        if (meta) { const m = JSON.parse(meta); setExcludedCount(m.excludedCount || 0); }
      } catch {}
    } catch { router.push('/'); }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flag cleanup is handled by Topbar/Sidebar navigation — not here.
  // Avoids React Strict Mode double-mount clearing the flag prematurely.

  // Sorted + filtered
  const sorted = useMemo(() => {
    let list = results.map(r => {
      const a = r.analysis;
      return {
        ...r,
        pcf: compositeOverall(a),
        reach: dimensionScore(a, 'reach_relevance'),
        eng: dimensionScore(a, 'engagement_quality'),
        para: dimensionScore(a, 'parasocial_depth'),
        brand: dimensionScore(a, 'brand_fit'),
        growth: dimensionScore(a, 'growth_potential'),
        plat: r.platform === 'instagram' ? 'IG' : 'YT',
        lang: normalizeLang(r.searchLanguage),
      };
    });

    if (filterPlat !== 'all') list = list.filter(r => r.plat === filterPlat);
    if (filterLang !== 'all') list = list.filter(r => r.lang === filterLang);

    const key = { pcf: 'pcf', reach: 'reach', engagement: 'eng', parasocial: 'para', brand: 'brand', growth: 'growth' }[sortBy] || 'pcf';
    list.sort((a, b) => b[key] - a[key]);
    return list;
  }, [results, sortBy, filterPlat, filterLang]);

  const pinnedCount = [...pinnedIds].filter(id => sorted.some(r => r.channelId === id)).length;
  const hiddenCount = hiddenIds.size;
  const avgPcf = sorted.length > 0 ? (sorted.reduce((s, r) => s + r.pcf, 0) / sorted.length).toFixed(1) : '—';

  const togglePin = (id) => {
    setPinnedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const markNotRelevant = async (creator) => {
    const id = creator.channelId;
    setHiddenIds(prev => new Set([...prev, id]));

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: id, channelName: creator.channelName,
          platform: creator.platform, action: 'not_relevant',
          category: searchCriteria?.category || '',
          language: creator.searchLanguage || '',
        }),
      });
      if (res.ok) {
        const learning = await res.json();
        try {
          const raw = localStorage.getItem('scoutIrrelevantLearnings');
          const arr = raw ? JSON.parse(raw) : [];
          arr.push({ ...learning, channelId: id, channelName: creator.channelName, ts: new Date().toISOString() });
          localStorage.setItem('scoutIrrelevantLearnings', JSON.stringify(arr));
        } catch {}
        refreshLearnings();
      }
    } catch {}
  };

  const onExportPDF = async () => {
    setExporting(true);
    try {
      const { generateReport } = await import('@/lib/reportGenerator');
      const pinned = sorted.filter(r => pinnedIds.has(r.channelId));
      const toExport = pinned.length > 0 ? pinned : sorted.slice(0, 3);
      await generateReport(toExport, searchCriteria, dimWeights);
    } catch (e) {
      console.error('PDF export failed:', e);
      alert('PDF export failed. Please try again.');
    }
    setExporting(false);
  };

  const uniqueLangs = [...new Set(results.map(r => normalizeLang(r.searchLanguage)))].sort();

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Topbar />
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>Loading results…</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Topbar />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        <Sidebar section="workspace" active="Recent scouts" />
        <main style={{ flex: 1, overflow: 'auto' }}>
          {/* Header */}
          <div style={{
            padding: '16px 24px 14px', borderBottom: '1px solid var(--line)',
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div>
              <div className="eyebrow">Run complete</div>
              <div style={{ fontSize: 17, fontWeight: 600, marginTop: 1, color: 'var(--ink)' }}>
                {searchCriteria?.category || 'Search'} · {sorted.length} / {results.length} cleared filters
              </div>
              {excludedCount > 0 && (
                <div style={{
                  fontSize: 11.5, color: 'var(--muted)', marginTop: 3,
                  fontFamily: 'var(--font-mono)', letterSpacing: '0.02em',
                }}>
                  {excludedCount} past creator{excludedCount !== 1 ? 's' : ''} excluded from this run
                </div>
              )}
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button style={smallBtn} onClick={() => router.push('/')}>+ New scout</button>
              <button
                onClick={onExportPDF}
                disabled={exporting}
                style={{
                  height: 28, padding: '0 12px', border: 'none', borderRadius: 5,
                  background: 'var(--ink)', color: 'var(--bg)', fontSize: 12,
                  fontWeight: 500, cursor: exporting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                }}
              >{exporting ? 'Exporting…' : `↓ Export ${pinnedCount > 0 ? pinnedCount : Math.min(3, sorted.length)}-creator PDF`}</button>
            </div>
          </div>

          {/* Filter bar */}
          <div style={{
            padding: '10px 24px', borderBottom: '1px solid var(--line)',
            display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, background: 'var(--surface)',
            flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                ['Sort: PCF', 'pcf'],
                ...activeDims.map(d => [d.sortLabel, d.sortKey]),
              ].map(([l, v]) => (
                <button key={v} onClick={() => setSortBy(v)} style={{
                  height: 26, padding: '0 9px',
                  border: '1px solid ' + (sortBy === v ? 'var(--ink)' : 'var(--line)'),
                  borderRadius: 5, background: sortBy === v ? 'var(--ink)' : 'var(--surface)',
                  color: sortBy === v ? 'var(--bg)' : 'var(--ink-2)',
                  fontSize: 11.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                }}>{l}</button>
              ))}
            </div>
            <div style={{ width: 1, height: 16, background: 'var(--line)' }} />
            {/* Platform filter */}
            <div style={{ display: 'flex', gap: 4 }}>
              {[['All', 'all'], ['YT', 'YT'], ['IG', 'IG']].map(([l, v]) => (
                <button key={v} onClick={() => setFilterPlat(v)} style={{
                  height: 24, padding: '0 8px', borderRadius: 4,
                  border: '1px solid ' + (filterPlat === v ? 'var(--ink)' : 'var(--line)'),
                  background: filterPlat === v ? 'var(--ink)' : 'transparent',
                  color: filterPlat === v ? 'var(--bg)' : 'var(--ink-2)',
                  fontSize: 10.5, cursor: 'pointer', fontFamily: 'inherit',
                }}>{l}</button>
              ))}
            </div>
            {/* Lang filter */}
            {uniqueLangs.length > 1 && (
              <select
                value={filterLang}
                onChange={e => setFilterLang(e.target.value)}
                style={{
                  height: 24, padding: '0 6px', border: '1px solid var(--line)',
                  borderRadius: 4, fontSize: 11, background: 'var(--surface)',
                  color: 'var(--ink-2)', fontFamily: 'inherit',
                }}
              >
                <option value="all">All langs</option>
                {uniqueLangs.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            )}
            <div style={{ marginLeft: 'auto', color: 'var(--muted)' }}>
              {pinnedCount > 0 && <span>{pinnedCount} pinned · </span>}
              {hiddenCount > 0 && <span>{hiddenCount} hidden · </span>}
              Avg PCF <b style={{ color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{avgPcf}</b>
            </div>
          </div>

          {/* Table header — dynamic based on active dimensions */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: gridCols, columnGap: 8,
            padding: '9px 24px', borderBottom: '1px solid var(--line)',
            background: 'var(--surface-2)',
            fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase',
            letterSpacing: '0.04em', fontWeight: 500,
          }}>
            {[
              { label: '#', align: 'left' },
              { label: 'Creator', align: 'left' },
              { label: 'Plat', align: 'left' },
              { label: 'Lang', align: 'left' },
              { label: 'Subs', align: 'right' },
              { label: 'PCF', align: 'right' },
              { label: '', align: 'left' },
              ...activeDims.map(d => ({ label: d.header, align: 'right' })),
              { label: 'Momentum', align: 'left' },
              { label: '', align: 'left' },
            ].map((col, i) => (
              <div key={i} style={{ textAlign: col.align }}>{col.label}</div>
            ))}
          </div>

          {/* Table rows */}
          {sorted.map((c, i) => {
            const pinned = pinnedIds.has(c.channelId);
            const hidden = hiddenIds.has(c.channelId);
            const expanded = expandedId === c.channelId;
            const dims = [c.reach, c.eng, c.para, c.brand, c.growth];
            const mom = c.momentum || { bucket: 'low-signal', trend: [], lastUpload: '?' };

            return (
              <div key={c.channelId || i}>
                <div
                  onClick={() => setExpandedId(expanded ? null : c.channelId)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: gridCols, columnGap: 8,
                    padding: '10px 24px', borderBottom: '1px solid var(--line-2)',
                    alignItems: 'center', cursor: 'pointer',
                    background: pinned ? 'var(--pinned-bg)' : (i % 2 === 1 ? 'var(--surface)' : 'var(--bg)'),
                    opacity: hidden ? 0.45 : 1,
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{ color: pinned ? 'var(--accent)' : 'var(--faint)', fontSize: 11 }}>
                    {pinned ? '◆' : String(i + 1).padStart(2, '0')}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: 999, flexShrink: 0,
                      background: c.thumbnailUrl ? 'var(--surface-2)' : (pinned ? 'var(--accent)' : 'var(--ink)'),
                      color: pinned ? 'var(--accent-ink)' : 'var(--bg)',
                      display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 600,
                      overflow: 'hidden',
                    }}>
                      {c.thumbnailUrl
                        ? <img src={c.thumbnailUrl} alt="" style={{ width: 24, height: 24, objectFit: 'cover' }} />
                        : initial(c.channelName)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontWeight: 500, color: 'var(--ink)', fontSize: 12.5, lineHeight: 1.35,
                        overflow: 'hidden', display: '-webkit-box',
                        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      }}>
                        {c.channelName}
                      </div>
                    </div>
                  </div>
                  <div>
                    <span style={{
                      padding: '1px 6px', borderRadius: 3,
                      background: c.plat === 'YT' ? 'var(--plat-yt-bg)' : 'var(--plat-ig-bg)',
                      color: c.plat === 'YT' ? 'var(--plat-yt)' : 'var(--plat-ig)',
                      fontWeight: 500, fontSize: 10.5, fontFamily: 'var(--font-mono)',
                    }}>{c.plat}</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-2)' }}>{c.lang}</div>
                  <div style={{ textAlign: 'right', color: 'var(--ink-2)' }}>{formatSubs(c.subscriberCount, c.platform)}</div>
                  <div style={{
                    textAlign: 'right', fontWeight: 600, fontSize: 14,
                    color: c.pcf >= 80 ? 'var(--accent)' : 'var(--ink)',
                  }}>{c.pcf}</div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <Rosette values={dims} weights={resultWeightsArr} size={36} />
                  </div>
                  {activeDims.map((d) => {
                    const v = c[d.prop];
                    return (
                      <div key={d.key} style={{
                        textAlign: 'right', fontSize: 12,
                        fontVariantNumeric: 'tabular-nums',
                        color: v >= 80 ? 'var(--accent)' : v >= 60 ? 'var(--ink)' : 'var(--ink-2)',
                        fontWeight: v >= 70 ? 500 : 400,
                      }}>{v}</div>
                    );
                  })}
                  <div><MomentumChip mom={mom} /></div>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    <button
                      title={pinned ? 'Unpin' : 'Pin'}
                      onClick={(e) => { e.stopPropagation(); togglePin(c.channelId); }}
                      style={{
                        width: 22, height: 22, border: '1px solid ' + (pinned ? 'var(--accent)' : 'var(--line)'),
                        background: pinned ? 'var(--accent)' : 'var(--surface)',
                        color: pinned ? 'var(--accent-ink)' : 'var(--ink-2)',
                        borderRadius: 4, fontSize: 11, cursor: 'pointer',
                      }}>◆</button>
                    {!hidden && (
                      <button
                        title="Not relevant"
                        onClick={(e) => { e.stopPropagation(); markNotRelevant(c); }}
                        style={{
                          width: 22, height: 22, border: '1px solid var(--line)',
                          background: 'var(--surface)', color: 'var(--accent-warn)',
                          borderRadius: 4, fontSize: 11, cursor: 'pointer',
                        }}>✕</button>
                    )}
                  </div>
                </div>

                {/* Expanded detail row */}
                {expanded && (
                  <div style={{
                    padding: '16px 24px 16px 56px', borderBottom: '1px solid var(--line)',
                    background: 'var(--surface)',
                  }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                      <div>
                        <div className="eyebrow" style={{ marginBottom: 6 }}>Claude{'’'}s reasoning</div>
                        <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>
                          {c.analysis?.pcf_score?.reasoning || 'No reasoning available.'}
                        </div>
                      </div>
                      <div>
                        <div className="eyebrow" style={{ marginBottom: 6 }}>Top comments</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {pickReceipts(c.comments, 3).map((comment, ci) => (
                            <div key={ci} style={{
                              fontSize: 12, lineHeight: 1.5, color: 'var(--ink-2)',
                              padding: '8px 10px', border: '1px solid var(--line-2)', borderRadius: 5,
                              background: 'var(--bg)',
                            }}>
                              {comment.length > 200 ? comment.slice(0, 200) + '…' : comment}
                            </div>
                          ))}
                          {pickReceipts(c.comments, 3).length === 0 && (
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>No substantive comments available.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {sorted.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
              No results match the current filters.
            </div>
          )}

          {/* Footer */}
          <div style={{
            padding: '12px 24px', borderTop: '1px solid var(--line)',
            background: 'var(--surface-2)', display: 'flex',
            alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink-2)',
          }}>
            <span>{pinnedCount > 0 ? `${pinnedCount} selected` : `${sorted.length} creators`}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setDossierOpen(true)} style={smallBtn}>View dossier</button>
              <button
                onClick={onExportPDF}
                disabled={exporting}
                style={{
                  height: 28, padding: '0 12px', border: 'none', borderRadius: 5,
                  background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 500,
                  fontSize: 12, cursor: exporting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                }}
              >
                {exporting ? 'Exporting…' : `Export ${pinnedCount > 0 ? pinnedCount : Math.min(3, sorted.length)}-creator dossier`}
              </button>
            </div>
          </div>
        </main>

        {/* Dossier Drawer */}
        {dossierOpen && (
          <DossierDrawer
            creators={sorted.filter(r => pinnedIds.has(r.channelId)).length > 0
              ? sorted.filter(r => pinnedIds.has(r.channelId))
              : sorted.slice(0, 3)}
            onClose={() => setDossierOpen(false)}
            onExport={onExportPDF}
            exporting={exporting}
            dimWeightsArr={resultWeightsArr}
            activeDims={activeDims}
          />
        )}
      </div>
    </div>
  );
}

function DossierDrawer({ creators, onClose, onExport, exporting, dimWeightsArr, activeDims }) {
  return (
    <>
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0, background: 'var(--scrim)', zIndex: 50,
      }} />
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 480,
        background: 'var(--surface)', borderLeft: '1px solid var(--line)',
        display: 'flex', flexDirection: 'column', zIndex: 51,
        boxShadow: '-12px 0 32px rgba(0,0,0,0.06)',
      }}>
        <div style={{
          padding: '16px 22px', borderBottom: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div className="eyebrow">Dossier</div>
            <div style={{ fontSize: 17, fontWeight: 600, marginTop: 2, color: 'var(--ink)' }}>
              {creators.length} creators
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 26, height: 26, border: '1px solid var(--line)',
            background: 'var(--surface)', color: 'var(--ink-2)',
            borderRadius: 5, fontSize: 13, cursor: 'pointer',
          }}>✕</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {creators.map((c, i) => {
            const dims = [c.reach, c.eng, c.para, c.brand, c.growth];
            const mom = c.momentum || { bucket: 'low-signal', trend: [], lastUpload: '?' };
            return (
              <div key={c.channelId || i} style={{
                padding: '14px 22px',
                borderBottom: i < creators.length - 1 ? '1px solid var(--line-2)' : 'none',
              }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 999,
                    background: c.thumbnailUrl ? 'var(--surface-2)' : 'var(--ink)',
                    color: 'var(--bg)', display: 'grid', placeItems: 'center',
                    fontWeight: 600, fontSize: 12, overflow: 'hidden',
                  }}>
                    {c.thumbnailUrl
                      ? <img src={c.thumbnailUrl} alt="" style={{ width: 30, height: 30, objectFit: 'cover' }} />
                      : initial(c.channelName)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 13.5, color: 'var(--ink)' }}>{c.channelName}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {formatSubs(c.subscriberCount, c.platform)} · {c.plat}/{c.lang}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="eyebrow" style={{ marginBottom: 0 }}>PCF</div>
                    <div style={{ fontSize: 17, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--ink)' }}>
                      {c.pcf}
                    </div>
                  </div>
                </div>

                <div style={{
                  display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12,
                  marginTop: 10, alignItems: 'center',
                }}>
                  <Rosette values={dims} weights={dimWeightsArr} size={56} />
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${activeDims.length},1fr)`, gap: 6 }}>
                    {activeDims.map((d) => {
                      const v = c[d.prop];
                      return (
                        <div key={d.key}>
                          <div style={{ fontSize: 9.5, color: 'var(--muted)', textTransform: 'uppercase' }}>
                            {d.dossierLabel}
                          </div>
                          <div style={{ height: 3, background: 'var(--surface-2)', borderRadius: 2, marginTop: 3 }}>
                            <div style={{
                              height: '100%', width: v + '%',
                              background: d.key === 'parasocial_depth' ? 'var(--accent)' : 'var(--ink)', borderRadius: 2,
                            }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MomentumChip mom={mom} />
                  <span style={{ fontSize: 10.5, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                    last {mom.lastUpload || '?'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{
          padding: '14px 22px', borderTop: '1px solid var(--line)',
          background: 'var(--surface-2)',
        }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{
              flex: 1, height: 34, border: '1px solid var(--line)', borderRadius: 6,
              background: 'var(--surface)', fontSize: 12.5, cursor: 'pointer',
              color: 'var(--ink-2)', fontFamily: 'inherit',
            }}>Close</button>
            <button
              onClick={onExport}
              disabled={exporting}
              style={{
                flex: 1.4, height: 34, border: 'none', borderRadius: 6,
                background: 'var(--ink)', color: 'var(--bg)',
                fontSize: 12.5, fontWeight: 500, cursor: exporting ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >{exporting ? 'Exporting…' : '↓ Export PDF brief'}</button>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
            PDF includes PCF cards, momentum, top comments, draft outreach
          </div>
        </div>
      </div>
    </>
  );
}
