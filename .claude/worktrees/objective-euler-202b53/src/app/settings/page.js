'use client';

import { useState, useEffect } from 'react';
import Topbar from '@/components/Topbar';
import Sidebar from '@/components/Sidebar';
import {
  DEFAULT_GATES, DEFAULT_DIMENSION_WEIGHTS, THEME_OPTIONS, MOMENTUM_SPEC,
  loadGateOverrides, saveGateOverrides, mergeGates, applyThemeLive,
} from '@/config/gates';

export default function SettingsPage() {
  const [mounted, setMounted] = useState(false);
  const [cfg, setCfg] = useState(DEFAULT_GATES);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [learnings, setLearnings] = useState([]);

  useEffect(() => {
    setMounted(true);
    setCfg(mergeGates(loadGateOverrides()));
    try {
      const raw = localStorage.getItem('scoutIrrelevantLearnings');
      setLearnings(raw ? JSON.parse(raw) : []);
    } catch {}
  }, []);

  const update = (key, val) => {
    setCfg(prev => ({ ...prev, [key]: val }));
    setDirty(true);
    setSaved(false);
  };

  const changeTheme = (theme) => {
    setCfg(prev => ({ ...prev, theme }));
    applyThemeLive(theme);
    // Persist theme immediately (visual preference)
    try {
      const current = loadGateOverrides() || {};
      if (theme === DEFAULT_GATES.theme) delete current.theme;
      else current.theme = theme;
      saveGateOverrides(Object.keys(current).length === 0 ? null : current);
    } catch {}
  };

  const onSave = () => {
    const overrides = {};
    for (const k of Object.keys(DEFAULT_GATES)) {
      if (cfg[k] !== DEFAULT_GATES[k]) overrides[k] = cfg[k];
    }
    saveGateOverrides(Object.keys(overrides).length === 0 ? null : overrides);
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const onResetAll = () => {
    const yes = window.confirm('Reset all settings to defaults?');
    if (!yes) return;
    saveGateOverrides(null);
    setCfg({ ...DEFAULT_GATES });
    applyThemeLive(DEFAULT_GATES.theme);
    setDirty(false);
  };

  const removeLearning = (channelId) => {
    try {
      const raw = localStorage.getItem('scoutIrrelevantLearnings');
      const arr = raw ? JSON.parse(raw) : [];
      const filtered = arr.filter(l => l.channelId !== channelId);
      localStorage.setItem('scoutIrrelevantLearnings', JSON.stringify(filtered));
      setLearnings(filtered);
    } catch {}
  };

  const clearAllLearnings = () => {
    const yes = window.confirm(`Clear all ${learnings.length} saved learnings? Future searches will no longer filter by past "not relevant" feedback.`);
    if (!yes) return;
    try { localStorage.removeItem('scoutIrrelevantLearnings'); } catch {}
    setLearnings([]);
  };

  if (!mounted) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Topbar />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Sidebar section="settings" active="Appearance" />
        <main style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
          <div className="eyebrow">Settings</div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 2, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
            Appearance &amp; Gates
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 4, marginBottom: 14, maxWidth: 580 }}>
            Workspace theme and pipeline gates. Theme changes apply instantly. Gate changes take effect on the next scout run.
          </div>

          {/* Theme */}
          <SettingsRow label="Theme" hint="Affects colors and surfaces across the entire product. Saved to your browser.">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {THEME_OPTIONS.map(t => (
                <button key={t.value} onClick={() => changeTheme(t.value)} style={{
                  padding: 14, background: 'var(--surface)', cursor: 'pointer', textAlign: 'left',
                  border: cfg.theme === t.value ? '2px solid var(--ink)' : '1px solid var(--line)',
                  borderRadius: 6, position: 'relative', fontFamily: 'inherit',
                }}>
                  <div style={{ display: 'flex', gap: 3, marginBottom: 10 }}>
                    {t.sw.map((c, i) => (
                      <span key={i} style={{
                        width: 18, height: 18, background: c, borderRadius: 3,
                        border: '1px solid rgba(0,0,0,0.08)',
                      }} />
                    ))}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>{t.label}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.4 }}>{t.sub}</div>
                  {cfg.theme === t.value && (
                    <span style={{
                      position: 'absolute', top: 8, right: 8, width: 18, height: 18,
                      borderRadius: '50%', background: 'var(--ink)', color: 'var(--bg)',
                      display: 'grid', placeItems: 'center', fontSize: 11,
                    }}>✓</span>
                  )}
                </button>
              ))}
            </div>
          </SettingsRow>

          {/* Geography gate */}
          <SettingsRow
            label="Geography gate"
            hint="Binary India pass/fail. Uses YouTube country field + comment language heuristic. Non-India creators are filtered out before analysis."
          >
            <Toggle
              value={cfg.geographyGateEnabled !== false}
              onChange={v => update('geographyGateEnabled', v)}
            />
          </SettingsRow>

          {/* Dimension weights */}
          <SettingsRow
            label="PCF dimension weights"
            hint="Weights must sum to 100%. These control how the overall PCF composite score is calculated."
          >
            <DimensionWeightSliders
              weights={cfg.dimensionWeights || DEFAULT_DIMENSION_WEIGHTS}
              onChange={w => { setCfg(prev => ({ ...prev, dimensionWeights: w })); setDirty(true); setSaved(false); }}
            />
          </SettingsRow>

          {/* Strict language */}
          <SettingsRow
            label="Strict-language mode"
            hint="When ON, regional-language targets require actual native-language signal. Fewer results but higher fidelity."
          >
            <Toggle
              value={cfg.strictRegionalLanguage}
              onChange={v => update('strictRegionalLanguage', v)}
            />
          </SettingsRow>

          {/* Category blacklists */}
          <SettingsRow label="Category blacklists" hint="Regex-based filters that cut content categories before Claude sees them.">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                ['blacklistNewsPolitics', 'News & politics'],
                ['blacklistMusicFilm', 'Music labels & film'],
                ['blacklistTechElectronics', 'Tech & gadget reviews'],
                ['blacklistMotivational', 'Motivational & self-help'],
              ].map(([key, label]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>{label}</span>
                  <Toggle value={cfg[key]} onChange={v => update(key, v)} />
                </div>
              ))}
            </div>
          </SettingsRow>

          {/* User learnings toggle */}
          <SettingsRow
            label="Apply feedback learnings"
            hint={'When ON, creators flagged as "not relevant" on past results are filtered from future searches.'}
          >
            <Toggle value={cfg.applyUserLearnings} onChange={v => update('applyUserLearnings', v)} />
          </SettingsRow>

          {/* Feedback learnings list */}
          {learnings.length > 0 && (
            <SettingsRow
              label="Saved learnings"
              hint={`${learnings.length} inferred rules from past "not relevant" marks.`}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {learnings.slice(0, 10).map((l, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 5,
                    fontSize: 12, background: 'var(--surface)',
                  }}>
                    <span style={{ flex: 1, color: 'var(--ink)' }}>
                      {l.channelName || l.channelId} — {l.reason || 'marked not relevant'}
                    </span>
                    <span style={{ color: 'var(--faint)', fontSize: 11, whiteSpace: 'nowrap' }}>
                      {l.ts ? timeSince(new Date(l.ts)) : ''}
                    </span>
                    <button
                      onClick={() => removeLearning(l.channelId)}
                      style={{
                        fontSize: 11, color: 'var(--accent-warn)', background: 'transparent',
                        border: 'none', cursor: 'pointer', padding: '2px 4px',
                      }}
                    >✕</button>
                  </div>
                ))}
                {learnings.length > 10 && (
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    + {learnings.length - 10} more
                  </div>
                )}
                <button
                  onClick={clearAllLearnings}
                  style={{
                    alignSelf: 'flex-start', marginTop: 4,
                    fontSize: 11.5, color: 'var(--accent-warn)',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >Clear all learnings</button>
              </div>
            </SettingsRow>
          )}

          {/* Save bar */}
          <div style={{
            marginTop: 24, padding: '16px 0', borderTop: '1px solid var(--line)',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <button
              onClick={onResetAll}
              style={{
                height: 32, padding: '0 14px', borderRadius: 6,
                border: '1px solid var(--line)', background: 'var(--surface)',
                fontSize: 12.5, color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >↺ Reset all to defaults</button>
            <div style={{ flex: 1 }} />
            {saved && <span style={{ fontSize: 12, color: 'var(--accent)' }}>✓ Saved</span>}
            <button
              onClick={onSave}
              disabled={!dirty}
              style={{
                height: 32, padding: '0 16px', borderRadius: 6, border: 'none',
                background: dirty ? 'var(--accent)' : 'var(--muted)',
                color: 'var(--accent-ink)', fontWeight: 500, fontSize: 13,
                cursor: dirty ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                opacity: dirty ? 1 : 0.5,
              }}
            >Save gate changes</button>
          </div>
        </main>
      </div>
    </div>
  );
}

function SettingsRow({ label, hint, children }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 24,
      padding: '18px 0', borderBottom: '1px solid var(--line-2)', alignItems: 'flex-start',
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{label}</div>
        {hint && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3, lineHeight: 1.5 }}>{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      style={{
        position: 'relative', width: 36, height: 20, borderRadius: 999, border: 'none',
        background: value ? 'var(--accent)' : 'var(--line)', cursor: 'pointer',
        transition: 'background 0.15s',
      }}
    >
      <span style={{
        position: 'absolute', top: 2,
        left: value ? 18 : 2,
        width: 16, height: 16, borderRadius: 999,
        background: '#fff', transition: 'left 0.15s',
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
      }} />
    </button>
  );
}

function timeSince(date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

const WEIGHT_LABELS = {
  engagement_quality: 'Engagement Quality',
  reach_relevance: 'Reach Relevance',
  growth_potential: 'Growth Potential',
  parasocial_depth: 'Parasocial Depth',
  brand_fit: 'Brand Fit',
};

function DimensionWeightSliders({ weights, onChange }) {
  const keys = Object.keys(DEFAULT_DIMENSION_WEIGHTS);
  const sum = keys.reduce((s, k) => s + (weights[k] || 0), 0);
  const isValid = sum === 100;

  const handleChange = (key, val) => {
    const next = { ...weights, [key]: val };
    onChange(next);
  };

  const handleReset = () => {
    onChange({ ...DEFAULT_DIMENSION_WEIGHTS });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {keys.map(k => (
        <div key={k}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 12, color: 'var(--ink)' }}>{WEIGHT_LABELS[k]}</span>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 500,
              color: 'var(--ink)', fontVariantNumeric: 'tabular-nums',
            }}>{weights[k]}%</span>
          </div>
          <input
            type="range" min={0} max={60} step={1}
            value={weights[k]}
            onChange={e => handleChange(k, parseInt(e.target.value, 10))}
            style={{ width: '100%', accentColor: 'var(--accent)' }}
          />
        </div>
      ))}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 4, padding: '8px 0', borderTop: '1px solid var(--line-2)',
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 600,
          color: isValid ? 'var(--accent)' : 'var(--danger)',
        }}>
          Total: {sum}%{!isValid && ' (must be 100%)'}
        </span>
        <button
          onClick={handleReset}
          style={{
            fontSize: 11, color: 'var(--ink-2)', background: 'transparent',
            border: '1px solid var(--line)', borderRadius: 4,
            padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >Reset to defaults</button>
      </div>
    </div>
  );
}
