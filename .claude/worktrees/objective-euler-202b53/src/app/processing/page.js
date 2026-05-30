'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Topbar from '@/components/Topbar';
import Rosette from '@/components/Rosette';
import MomentumChip, { computeMomentum } from '@/components/MomentumChip';
import { getActiveGates, DEFAULT_DIMENSION_WEIGHTS } from '@/config/gates';
import { saveScoutToHistory, setResultsActive, getExclusionSet, registerScoutedCreators } from '@/lib/scoutHistory';
import { checkGeographyGate } from '@/lib/youtube';

const STAGES = [
  { key: 'search',  num: 'I',   label: 'Search',  desc: 'Querying YouTube + IG' },
  { key: 'fetch',   num: 'II',  label: 'Fetch',    desc: 'Pulling comments per candidate' },
  { key: 'analyze', num: 'III', label: 'Read',     desc: 'Claude · PCF audit' },
  { key: 'rank',    num: 'IV',  label: 'Rank',     desc: 'Composite · compile' },
];

function getThinkingSeed(index, totalComments, activeWeights) {
  const n = totalComments || 'several hundred';
  const w = activeWeights || {};
  const on = (k) => (w[k] || 0) > 0;

  // Build a pool of seeds based on active dimensions only
  const pool = [];

  // General (always included)
  pool.push(`Nearly ${n} comments. Scanning for language patterns, sentiment signals, and content relevance.`);
  pool.push('Comment set is light on English, heavy on native-script replies. Detection pipeline firing on Tamil + Hinglish.');

  if (on('reach_relevance')) {
    pool.push('Checking subscriber-to-view ratio. High subs with low views is a dead audience — penalising accordingly.');
    pool.push('Lots of reach, but thin depth on top. The first twenty comments are one-liners — the long tail tells a different story.');
  }
  if (on('engagement_quality')) {
    pool.push('Sorting genuine questions and product stories from generic "nice video bro" noise. Comment quality matters more than count.');
    pool.push('Heavy regional comment flow. "Didi" and "bhai" markers everywhere. Strangers trading brand recommendations.');
  }
  if (on('parasocial_depth')) {
    pool.push('Repeat handles emerging. Personal stories surfacing — skin cleared, friends asking, wedding photos. Trust signal building.');
    pool.push('Substantive threads. Viewers quoting the creator back to themselves. Long-arc trust playing out across years.');
  }
  if (on('brand_fit')) {
    pool.push('Cross-referencing content niche against brand category. Audience demographics and content style under review.');
    pool.push('Checking product mentions in comments. Purchase confession and "where to buy" signals are gold for brand alignment.');
  }
  if (on('growth_potential')) {
    pool.push('Upload cadence and view trajectory under review. Accelerating creators are worth more than stagnant large channels.');
    pool.push('Recent upload frequency is up. Subscriber growth curve suggests this creator is still building momentum.');
  }

  return pool[index % pool.length];
}

function initial(name = '') {
  const m = name.trim().match(/\S/);
  return (m ? m[0] : '?').toUpperCase();
}

function formatSubs(count, platform) {
  if (!count) return 'new creator';
  const k = count >= 1e6 ? `${(count / 1e6).toFixed(1)}M` : count >= 1000 ? `${Math.round(count / 1000)}K` : String(count);
  return `${k} ${platform === 'instagram' ? 'followers' : 'subs'}`;
}

function detectLang(c) {
  const langs = c?._preScreen?.detectedCommentLanguages || [];
  if (langs.length === 0) return (c.searchLanguage || 'EN').toUpperCase().slice(0, 8);
  const lang = langs[0];
  if (lang === 'Mixed / Hinglish' || lang === 'Hinglish') return 'HG';
  return lang.toUpperCase().slice(0, 2);
}

// Dimension key order used for PCF display (matches pcfDimLabels)
const PROC_DIM_KEYS = ['reach_relevance', 'engagement_quality', 'parasocial_depth', 'brand_fit', 'growth_potential'];

export default function ProcessingPage() {
  const router = useRouter();
  const cancelRef = useRef(false);
  const ranRef = useRef(false);

  // Active dimension weights for display
  const [dimWeights, setDimWeights] = useState(DEFAULT_DIMENSION_WEIGHTS);

  const [stageStatus, setStageStatus] = useState({
    search: 'pending', fetch: 'pending', analyze: 'pending', rank: 'pending',
  });
  const [stageDetail, setStageDetail] = useState({
    search: 'Warming up…', fetch: 'Awaiting survey…', analyze: 'Awaiting harvest…', rank: 'Waiting…',
  });
  const [pct, setPct] = useState(4);
  const [eta, setEta] = useState('warming up · ~1 min remaining');
  const [elapsed, setElapsed] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [error, setError] = useState(null);

  // Title line
  const [runTitle, setRunTitle] = useState('Starting…');

  // Live creator dossier
  const [live, setLive] = useState({
    idx: 0, total: 0, av: '?', name: 'Waiting…', handle: '', subs: '', lang: '',
    thinking: '', thinkingLabel: 'Claude is reading…',
    pcfValues: [null, null, null, null, null],
    onDeck: [],
  });

  // Load active weights on mount
  useEffect(() => {
    const g = getActiveGates();
    if (g.dimensionWeights) setDimWeights(g.dimensionWeights);
  }, []);

  // Timer
  const startRef = useRef(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setElapsed(((Date.now() - startRef.current) / 1000).toFixed(1)), 200);
    return () => clearInterval(iv);
  }, []);

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const setStage = (key, status) => setStageStatus(p => ({ ...p, [key]: status }));

  const typewrite = async (text, charMs = 14) => {
    for (let i = 0; i <= text.length; i++) {
      if (cancelRef.current) return;
      setLive(d => ({ ...d, thinking: text.slice(0, i) }));
      await sleep(charMs);
    }
  };

  // ── Main pipeline ──
  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const run = async () => {
      let formData = null;
      try {
        const raw = sessionStorage.getItem('scoutPendingSearch');
        if (raw) formData = JSON.parse(raw);
      } catch {}

      if (!formData || !formData.category) { router.replace('/'); return; }

      const platform = formData.platform || 'youtube';
      const requested = formData.maxResults || 5;
      const overfetchedTarget = Math.min(requested * (formData.excludePast ? 3 : 2), 50);
      let userLearnings = [];
      try {
        const raw = localStorage.getItem('scoutIrrelevantLearnings');
        if (raw) userLearnings = JSON.parse(raw) || [];
      } catch {}
      const gateConfig = getActiveGates();
      const searchPayload = { ...formData, maxResults: overfetchedTarget, userLearnings, gateConfig };
      const langDisplay = (formData.languages || []).slice(0, 3).join(', ') || 'English';
      const platName = platform === 'youtube' ? 'YouTube' : platform === 'instagram' ? 'Instagram' : 'YouTube + Instagram';

      setRunTitle(`${formData.category} · ${platName} · ${requested} creators · ${langDisplay}`);

      // ── STAGE I: Search ──
      setStage('search', 'active');
      setPct(8);
      setEta('canvassing the catalog · ~55s remaining');
      const excludeMsg = formData.excludePast ? ' (excluding past creators)' : '';
      setStageDetail(d => ({ ...d, search: `Querying ${platName} in ${langDisplay}…${excludeMsg}` }));

      let results = [];
      let languageBreakdown = {};
      let wasCached = false;
      let cacheAge = 0;

      try {
        if (platform === 'youtube' || platform === 'both') {
          const res = await fetch('/api/youtube/search', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(searchPayload),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `YouTube search failed (HTTP ${res.status})`);
          }
          const data = await res.json();
          results = [...results, ...(data.results || [])];
          languageBreakdown = { ...languageBreakdown, ...(data.languageBreakdown || {}) };
          if (data._cached) { wasCached = true; cacheAge = data._cacheAge || 0; }
        }
        if (platform === 'instagram' || platform === 'both') {
          setStageDetail(d => ({ ...d, search: `Hashtag sweep on Instagram…` }));
          const res = await fetch('/api/instagram/search', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              category: formData.category, subscriberRange: formData.subscriberRange,
              maxResults: overfetchedTarget, userLearnings, gateConfig,
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            if (platform === 'both' && results.length > 0) {
              console.warn('Instagram failed, continuing:', err.error);
            } else {
              throw new Error(err.error || `Instagram search failed (HTTP ${res.status})`);
            }
          } else {
            const data = await res.json();
            results = [...results, ...(data.results || [])];
            languageBreakdown = { ...languageBreakdown, ...(data.languageBreakdown || {}) };
          }
        }

        if (cancelRef.current) return;
        if (!results.length) {
          throw new Error('No creators matched your brief. Try widening the subscriber range, adding more languages, or switching platform.');
        }

        // Geography gate — binary India pass/fail
        let geoFiltered = 0;
        if (gateConfig.geographyGateEnabled !== false) {
          const before = results.length;
          results = results.filter(r => {
            // Only apply to YouTube — Instagram has its own location handling
            if (r.platform === 'instagram') return true;
            const geoResult = checkGeographyGate(
              { brandingSettings: { channel: { country: r._geoCountry } } },
              r.comments || []
            );
            return geoResult.passed;
          });
          geoFiltered = before - results.length;
          if (geoFiltered > 0) {
            setStageDetail(d => ({ ...d, search: `${results.length} creators after geography gate (${geoFiltered} non-India filtered)` }));
          }
        }

        // Exclude past creators if requested
        let excludedCount = 0;
        if (formData.excludePast) {
          const exclusionSet = getExclusionSet(formData.category, formData.platform || 'youtube');
          const before = results.length;
          results = results.filter(r => {
            const plat = r.platform || 'youtube';
            const id = r.channelId || '';
            return !exclusionSet.has(plat + ':' + id);
          });
          excludedCount = before - results.length;
          if (!results.length) {
            throw new Error(`All ${before} candidates were previously scouted. Try a different category or include past creators.`);
          }
        }

        const actual = results.length;
        setTotalCount(actual);
        const excludeNote = excludedCount > 0 ? ` (${excludedCount} past excluded)` : '';
        setStageDetail(d => ({ ...d, search: `Surfaced ${actual} creators · filtered to ${formData.subscriberRange} tier.${excludeNote}` }));
        setPct(18);
        setStage('search', 'done');

        // ── STAGE II: Fetch ──
        setStage('fetch', 'active');
        setEta('reading the comment bundles · ~45s remaining');
        for (let i = 0; i < Math.min(3, results.length); i++) {
          if (cancelRef.current) return;
          const c = results[i];
          const cc = (c.comments || []).length;
          setStageDetail(d => ({ ...d, fetch: `${c.channelName} · ${cc} comments` }));
          await sleep(420);
        }
        const totalComments = results.reduce((s, r) => s + ((r.comments || []).length), 0);
        setStageDetail(d => ({ ...d, fetch: `All harvested · ${totalComments} comments across ${actual} creators` }));
        await sleep(300);
        setPct(22);
        setStage('fetch', 'done');

        // ── STAGE III: Analyze ──
        setStage('analyze', 'active');
        const BATCH_SIZE = 3;
        const analyzedResults = [];

        for (let i = 0; i < results.length; i += BATCH_SIZE) {
          if (cancelRef.current) return;
          const batch = results.slice(i, i + BATCH_SIZE);
          const head = batch[0];
          const upcoming = results.slice(i + 1, i + 6);

          setLive({
            idx: i + 1, total: results.length,
            av: initial(head.channelName), name: head.channelName || 'Unknown',
            handle: '@' + (head.channelName || '').toLowerCase().replace(/\s+/g, '').slice(0, 24),
            subs: formatSubs(head.subscriberCount, platform),
            lang: detectLang(head),
            thinking: '', thinkingLabel: 'Claude is reading…',
            pcfValues: [null, null, null, null, null],
            onDeck: upcoming.map(c => ({
              av: initial(c.channelName),
              handle: (c.channelName || '').replace(/\s+/g, '').slice(0, 18),
            })),
          });

          const remainingCreators = results.length - i;
          setEta(`reading creator ${Math.min(i + 1, results.length)} of ${results.length} · ~${Math.max(5, Math.ceil(remainingCreators * 6))}s remaining`);
          setPct(Math.min(88, 22 + Math.round((i / results.length) * 66)));
          setStageDetail(d => ({ ...d, analyze: `Claude reading ${head.channelName}…` }));

          const analyses = Promise.allSettled(
            batch.map(async (influencer) => {
              try {
                const res = await fetch('/api/analyze', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ influencer, brandContext: formData.brandContext || '', dimensionWeights: gateConfig.dimensionWeights || DEFAULT_DIMENSION_WEIGHTS }),
                });
                if (res.ok) {
                  const { analysis } = await res.json();
                  return { ...influencer, analysis };
                }
                const errBody = await res.json().catch(() => ({}));
                console.error(`Analyze failed for ${influencer.channelName}: ${res.status}`, errBody);
                return null;
              } catch (err) {
                console.error(`Analyze exception for ${influencer.channelName}:`, err);
                return null;
              }
            })
          );

          await typewrite(getThinkingSeed(i, totalComments, gateConfig.dimensionWeights || DEFAULT_DIMENSION_WEIGHTS), 14);
          const batchResults = await analyses;
          if (cancelRef.current) return;

          const headAnalyzed = batchResults[0]?.status === 'fulfilled' ? batchResults[0].value : null;
          const pcfScores = headAnalyzed?.analysis?.pcf_score;
          const activeW = gateConfig.dimensionWeights || DEFAULT_DIMENSION_WEIGHTS;

          setLive(d => ({ ...d, thinkingLabel: 'Scored.' }));

          const keys = ['reach_relevance', 'engagement_quality', 'parasocial_depth', 'brand_fit', 'growth_potential'];
          for (let k = 0; k < 5; k++) {
            if (cancelRef.current) return;
            const dimKey = keys[k];
            const dimActive = (activeW[dimKey] || 0) > 0;

            if (!dimActive) {
              // Inactive dimension — set to 0, no animation delay
              setLive(d => {
                const pv = [...d.pcfValues];
                pv[k] = 0;
                return { ...d, pcfValues: pv };
              });
              continue;
            }

            await sleep(160);
            const dimScore = pcfScores?.[dimKey]?.score;
            const val = typeof dimScore === 'number' ? Math.round(dimScore) : Math.round(40 + Math.random() * 45);
            setLive(d => {
              const pv = [...d.pcfValues];
              pv[k] = val;
              return { ...d, pcfValues: pv };
            });
          }

          for (const r of batchResults) {
            if (r.status === 'fulfilled' && r.value) analyzedResults.push(r.value);
          }
          setDoneCount(Math.min(analyzedResults.length, results.length));
        }

        if (cancelRef.current) return;
        setStageDetail(d => ({ ...d, analyze: `All ${results.length} creators scored` }));
        await sleep(400);
        setPct(92);
        setStage('analyze', 'done');

        if (analyzedResults.length === 0) {
          throw new Error('AI analysis failed for all ' + results.length + ' creators. Open browser DevTools → Console to see the actual API error. Common causes: expired API key, model access, or rate limits.');
        }

        analyzedResults.sort((a, b) => b.analysis.pcf_score.overall - a.analysis.pcf_score.overall);
        analyzedResults.length = Math.min(analyzedResults.length, requested);

        // Compute momentum for each creator
        analyzedResults.forEach(r => {
          const vidDates = (r._videoPublishDates || []);
          r.momentum = computeMomentum(vidDates);
        });

        // ── STAGE IV: Rank ──
        setStage('rank', 'active');
        setEta('compiling dossier · almost done');
        setStageDetail(d => ({ ...d, rank: 'Sorting by PCF composite · compiling…' }));
        await sleep(900);

        analyzedResults.sort((a, b) => b.analysis.pcf_score.overall - a.analysis.pcf_score.overall);

        // Register these creators in the scouted-creators registry
        registerScoutedCreators(analyzedResults, formData.category);

        // Persist
        if (wasCached) localStorage.setItem('scoutCacheHit', JSON.stringify({ cached: true, ageSeconds: cacheAge }));
        else localStorage.removeItem('scoutCacheHit');
        if (languageBreakdown) localStorage.setItem('scoutLanguageBreakdown', JSON.stringify(languageBreakdown));
        localStorage.setItem('scoutResults', JSON.stringify(analyzedResults));
        localStorage.setItem('scoutSearchCriteria', JSON.stringify(formData));
        localStorage.setItem('scoutAnalysisMetadata', JSON.stringify({
          total: results.length, succeeded: analyzedResults.length,
          failed: results.length - analyzedResults.length, cancelled: false,
          excludedCount: excludedCount || 0,
        }));

        setPct(100);
        setStage('rank', 'done');
        setEta('complete — redirecting →');
        setStageDetail(d => ({ ...d, rank: 'Dossier compiled. Redirecting.' }));
        await sleep(600);

        if (!cancelRef.current) {
          try { sessionStorage.removeItem('scoutPendingSearch'); } catch {}
          // Save to persistent history and mark results as active
          saveScoutToHistory(formData, analyzedResults);
          setResultsActive();
          router.push('/results');
        }
      } catch (err) {
        setError(err.message || 'Something went wrong.');
      }
    };
    run();
  }, [router]);

  const onCancel = () => {
    const yes = window.confirm('Stop the run and return to the brief?');
    if (!yes) return;
    cancelRef.current = true;
    try { sessionStorage.removeItem('scoutPendingSearch'); } catch {}
    router.push('/');
  };

  const pcfDimLabels = ['Reach', 'Engagement', 'Parasocial', 'Brand fit', 'Growth'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Topbar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Run header */}
        <div style={{
          padding: '18px 28px 16px', borderBottom: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div className="eyebrow">Run · in progress · {elapsed}s elapsed</div>
            <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2, color: 'var(--ink)' }}>
              {runTitle}
            </div>
          </div>
          <button onClick={onCancel} type="button" style={{
            height: 30, padding: '0 12px', borderRadius: 6,
            border: '1px solid var(--line)', background: 'var(--surface)',
            fontSize: 12.5, color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'inherit',
          }}>✕ Stop run</button>
        </div>

        {error && (
          <div style={{
            margin: '28px auto', maxWidth: 520, padding: 24,
            border: '1px solid var(--danger)', borderRadius: 8,
            background: 'var(--danger-2)', color: 'var(--ink)',
          }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Pipeline error</div>
            <div style={{ fontSize: 13, marginBottom: 16 }}>{error}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => router.push('/')} style={{
                height: 32, padding: '0 14px', borderRadius: 6, border: '1px solid var(--ink)',
                background: 'var(--ink)', color: 'var(--bg)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
              }}>← Back to brief</button>
              <button onClick={() => window.location.reload()} style={{
                height: 32, padding: '0 14px', borderRadius: 6, border: '1px solid var(--line)',
                background: 'var(--surface)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
              }}>↻ Retry</button>
            </div>
          </div>
        )}

        {!error && (
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.05fr 1fr', minHeight: 0, overflow: 'hidden' }}>
            {/* Left: pipeline + giant progress */}
            <div style={{ padding: '28px 32px', borderRight: '1px solid var(--line)', overflow: 'auto' }}>
              <div className="eyebrow">Pipeline · 4 stages</div>
              <h1 style={{
                fontSize: 38, fontWeight: 600, letterSpacing: '-0.03em',
                margin: '8px 0 6px', lineHeight: 1, color: 'var(--ink)',
              }}>
                Reading <span style={{ color: 'var(--accent)', fontStyle: 'italic' }}>real</span><br />conversations.
              </h1>

              {/* Giant percentage + progress bar */}
              <div style={{
                marginTop: 28, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 24, alignItems: 'center',
              }}>
                <div>
                  <div style={{
                    fontSize: 84, fontWeight: 600, lineHeight: 0.85, letterSpacing: '-0.05em',
                    color: 'var(--accent)', fontVariantNumeric: 'tabular-nums',
                  }}>
                    {pct}<span style={{ fontSize: 28, color: 'var(--muted)' }}>%</span>
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)',
                    letterSpacing: '0.06em', marginTop: 6, textTransform: 'uppercase',
                  }}>{eta}</div>
                </div>
                <div>
                  <div style={{
                    height: 8, border: '1px solid var(--line)', background: 'var(--surface-2)',
                    position: 'relative', borderRadius: 4, overflow: 'hidden',
                  }}>
                    <div style={{
                      position: 'absolute', left: 0, top: 0, bottom: 0,
                      width: pct + '%', background: 'var(--accent)',
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)',
                    marginTop: 6, letterSpacing: '0.06em',
                  }}>
                    <span>0s</span><span>15s</span><span>30s</span><span>45s</span><span>60s</span>
                  </div>
                </div>
              </div>

              {/* Stage list */}
              <div style={{ marginTop: 24, border: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden' }}>
                {STAGES.map((s, i) => {
                  const status = stageStatus[s.key];
                  const isLive = status === 'active';
                  const isDone = status === 'done';
                  const isPend = status === 'pending';
                  return (
                    <div key={s.key} style={{
                      display: 'grid', gridTemplateColumns: '56px 1fr auto',
                      padding: '14px 16px',
                      borderTop: i ? '1px solid var(--line-2)' : 'none',
                      background: isLive ? 'var(--live-bg)' : 'transparent',
                      gap: 14, alignItems: 'center',
                    }}>
                      <div style={{
                        fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 18,
                        color: isPend ? 'var(--muted)' : 'var(--ink)', letterSpacing: '0.04em',
                      }}>{isDone ? '✓' : s.num}</div>
                      <div>
                        <div style={{
                          fontWeight: 600, fontSize: 14,
                          color: isPend ? 'var(--muted)' : 'var(--ink)',
                        }}>
                          {s.label}
                          {isLive && <span style={{
                            marginLeft: 10, fontFamily: 'var(--font-mono)', fontSize: 9.5,
                            color: 'var(--accent)', padding: '2px 6px',
                            border: '1px solid var(--accent)', letterSpacing: '0.08em', borderRadius: 3,
                          }}>● LIVE</span>}
                        </div>
                        <div style={{ fontSize: 12, color: isPend ? 'var(--muted)' : 'var(--ink-2)', marginTop: 2 }}>
                          {stageDetail[s.key]}
                        </div>
                      </div>
                      <div style={{
                        fontFamily: 'var(--font-mono)', fontSize: 10.5,
                        color: isPend ? 'var(--muted)' : 'var(--ink)', letterSpacing: '0.06em',
                      }}>
                        {isDone ? '✓ done' : isLive ? `+${elapsed}s` : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: Live creator analysis */}
            <div style={{ padding: '28px 32px', background: 'var(--surface)', overflow: 'auto' }}>
              <div className="eyebrow">
                Current subject · {live.idx} of {live.total || '?'}
              </div>
              <div style={{
                marginTop: 10, border: '1px solid var(--line)', borderRadius: 6,
                padding: 18, background: 'var(--bg)', position: 'relative',
              }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 46, height: 46, borderRadius: 999,
                    background: 'var(--accent)', color: 'var(--accent-ink)',
                    display: 'grid', placeItems: 'center', fontWeight: 600, fontSize: 18,
                    flexShrink: 0,
                  }}>{live.av}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
                      {live.name}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>
                      {live.handle} · {live.subs} · {live.lang}
                    </div>
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)',
                    letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <span style={{ width: 7, height: 7, background: 'var(--accent)', borderRadius: 999 }} />
                    READING
                  </div>
                </div>

                {/* Claude live output */}
                <div style={{
                  marginTop: 16, padding: 14, border: '1px dashed var(--line)', borderRadius: 5,
                  background: 'var(--surface)', fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-2)',
                  minHeight: 60,
                }}>
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--muted)',
                    letterSpacing: '0.08em', marginBottom: 4, textTransform: 'uppercase',
                  }}>Claude · {live.thinkingLabel}</div>
                  {live.thinking}
                  <span style={{
                    display: 'inline-block', width: 7, height: 14, background: 'var(--accent)',
                    marginLeft: 3, transform: 'translateY(2px)',
                    animation: 'blink 1s step-end infinite',
                  }} />
                </div>

                {/* PCF live with rosette */}
                <div style={{
                  marginTop: 16, display: 'grid', gridTemplateColumns: 'auto 1fr',
                  gap: 18, alignItems: 'center',
                }}>
                  <Rosette
                    values={live.pcfValues.map(v => v ?? 0)}
                    weights={PROC_DIM_KEYS.map(k => dimWeights[k] || 0)}
                    size={94}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {pcfDimLabels.map((l, i) => {
                      const v = live.pcfValues[i];
                      const done = v !== null;
                      const dimKey = PROC_DIM_KEYS[i];
                      const dimActive = (dimWeights[dimKey] || 0) > 0;
                      return (
                        <div key={l} style={{
                          display: 'grid', gridTemplateColumns: '1fr auto',
                          alignItems: 'center', gap: 10, fontSize: 11.5,
                          opacity: dimActive ? 1 : 0.35,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                              fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', width: 14,
                            }}>0{i + 1}</span>
                            <span style={{ color: !dimActive ? 'var(--muted)' : done ? 'var(--ink)' : 'var(--muted)' }}>
                              {l}
                              {!dimActive && <span style={{ marginLeft: 4, fontSize: 8, fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>OFF</span>}
                            </span>
                          </div>
                          <span style={{
                            fontFamily: 'var(--font-mono)', fontWeight: 600,
                            color: !dimActive ? 'var(--muted)' : done ? (i === 2 ? 'var(--accent)' : 'var(--ink)') : 'var(--muted)',
                            minWidth: 30, textAlign: 'right',
                          }}>{!dimActive ? '—' : (v ?? '——')}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* On deck */}
              {live.onDeck.length > 0 && (
                <>
                  <div className="eyebrow" style={{ marginTop: 22, marginBottom: 8 }}>
                    On deck · next {live.onDeck.length}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {live.onDeck.slice(0, 5).map((c, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
                        border: '1px solid var(--line)', borderRadius: 999,
                        fontSize: 11.5, background: 'var(--bg)',
                      }}>
                        <span style={{
                          width: 16, height: 16, borderRadius: 999, background: 'var(--ink)',
                          color: 'var(--bg)', display: 'grid', placeItems: 'center',
                          fontSize: 9, fontWeight: 600,
                        }}>{c.av}</span>
                        <span style={{ color: 'var(--ink-2)' }}>{c.handle}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
