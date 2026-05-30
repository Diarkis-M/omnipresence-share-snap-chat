'use client';

import { useEffect, useState } from 'react';
import {
  DEFAULT_GATES,
  PALETTE_OPTIONS,
  loadGateOverrides,
  saveGateOverrides,
  mergeGates,
  applyPaletteLive,
} from '@/config/gates';

/**
 * Scout Settings modal — runtime rollback for every hardcoded gate
 * added over the life of the project. Toggles here persist to
 * localStorage.scoutGateConfig and are read by the processing pipeline
 * on every subsequent search.
 *
 * Styled to match whichever editorial-page the modal sits on — the page
 * owns the .scout-<x> wrapper class, and the modal's overlay + panel
 * look native inside any of the three palette variants.
 */
export default function GatesModal({ open, onClose }) {
  const [cfg, setCfg] = useState(DEFAULT_GATES);
  const [dirty, setDirty] = useState(false);

  // Load current overrides whenever the modal opens
  useEffect(() => {
    if (!open) return;
    setCfg(mergeGates(loadGateOverrides()));
    setDirty(false);
  }, [open]);

  // Escape closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const update = (key, val) => {
    setCfg((prev) => ({ ...prev, [key]: val }));
    setDirty(true);
  };

  // Palette is a visual preference — apply it IMMEDIATELY so the user sees
  // the switch take effect as they click. Also persist immediately so it
  // sticks even if they close without "Save" — they're not configuring
  // search behaviour, they're configuring how the app looks.
  const changePalette = (palette) => {
    setCfg((prev) => ({ ...prev, palette }));
    applyPaletteLive(palette);
    try {
      const current = loadGateOverrides() || {};
      if (palette === DEFAULT_GATES.palette) {
        delete current.palette;
      } else {
        current.palette = palette;
      }
      saveGateOverrides(Object.keys(current).length === 0 ? null : current);
    } catch {}
  };

  const onSave = () => {
    // Only persist fields that differ from defaults — keeps storage compact
    const overrides = {};
    for (const k of Object.keys(DEFAULT_GATES)) {
      if (cfg[k] !== DEFAULT_GATES[k]) overrides[k] = cfg[k];
    }
    saveGateOverrides(Object.keys(overrides).length === 0 ? null : overrides);
    setDirty(false);
    onClose();
  };

  const onResetAll = () => {
    if (typeof window === 'undefined') return;
    const yes = window.confirm(
      'Reset every gate to its default setting?\n\nThe geography gate and every category blacklist turn back on, dimension weights reset to defaults, and your "Not relevant" learnings get applied again.'
    );
    if (!yes) return;
    saveGateOverrides(null);
    setCfg({ ...DEFAULT_GATES });
    setDirty(false);
  };

  if (!open) return null;

  const isDefault = JSON.stringify(cfg) === JSON.stringify(DEFAULT_GATES);

  return (
    <>
      <div className="gm-overlay" onClick={onClose} />
      <div className="gm-panel" role="dialog" aria-label="Scout settings">
        <div className="gm-head">
          <div className="gm-t">Scout <em>settings</em></div>
          <button type="button" className="gm-cls" onClick={onClose}>Close ✕</button>
        </div>

        <div className="gm-body">
          <div className="gm-lede">
            Every rule that the pipeline adds on top of raw YouTube &amp; Instagram results. Toggle anything off and it&rsquo;s disabled for every search until you flip it back on.
          </div>

          {/* Palette — visual theme */}
          <div className="gm-section">
            <div className="gm-section-head">
              <div className="gm-label">
                Palette
                {cfg.palette !== DEFAULT_GATES.palette && <span className="gm-diff"> · custom</span>}
              </div>
              <div className="gm-value" style={{ opacity: 0.6 }}>applies instantly</div>
            </div>
            <div className="gm-help">
              Three editorial themes from the original design handoff. Pick one and the switch takes effect across every page — landing, processing, results.
            </div>
            <div className="gm-palette-row">
              {PALETTE_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={`gm-palette-chip${cfg.palette === p.value ? ' on' : ''}`}
                  data-palette-chip={p.value}
                  onClick={() => changePalette(p.value)}
                  aria-pressed={cfg.palette === p.value}
                >
                  <span className="gm-palette-swatch" aria-hidden="true">
                    <span className="gm-palette-swatch-a" />
                    <span className="gm-palette-swatch-b" />
                    <span className="gm-palette-swatch-c" />
                  </span>
                  <span className="gm-palette-label">
                    <b>{p.label}</b>
                    <em>{p.note}</em>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Geography gate — toggle */}
          <ToggleRow
            label="Geography gate (India)"
            help="Binary pre-filter: uses YouTube country field + comment language heuristic to reject non-India creators. English is neutral — only foreign languages like Russian/French/Arabic trigger rejection."
            value={cfg.geographyGateEnabled !== false}
            onChange={(v) => update('geographyGateEnabled', v)}
          />

          {/* Strict regional language */}
          <ToggleRow
            label="Strict regional-language gate"
            help={<>Requires actual Tamil/Telugu/Bengali/Odia/etc. signal (native script, city, defaultLanguage) on candidates for those languages. Turn off to let the pipeline fall back to the without-signal pool when the target language has no real matches — you&rsquo;ll get more results but some may be mislabelled.</>}
            value={cfg.strictRegionalLanguage}
            onToggle={(v) => update('strictRegionalLanguage', v)}
            defaultVal={DEFAULT_GATES.strictRegionalLanguage}
          />

          {/* Category blacklists */}
          <div className="gm-section">
            <div className="gm-section-head">
              <div className="gm-label">Category blacklists</div>
              <div className="gm-value" style={{ opacity: 0.6 }}>
                {[
                  cfg.blacklistNewsPolitics,
                  cfg.blacklistMusicFilm,
                  cfg.blacklistTechElectronics,
                  cfg.blacklistMotivational,
                ].filter(Boolean).length} / 4 active
              </div>
            </div>
            <div className="gm-help">
              Name/description regex filters that cut entire content categories before Claude ever sees them.
            </div>

            <ToggleRow
              inline
              label="News & politics"
              help={<>Blocks TV news channels, election/politics content, cricket commentary. The original blacklist from day one.</>}
              value={cfg.blacklistNewsPolitics}
              onToggle={(v) => update('blacklistNewsPolitics', v)}
              defaultVal={DEFAULT_GATES.blacklistNewsPolitics}
            />
            <ToggleRow
              inline
              label="Music labels & film"
              help={<>Blocks official music channels, movie trailers, film/cinema content.</>}
              value={cfg.blacklistMusicFilm}
              onToggle={(v) => update('blacklistMusicFilm', v)}
              defaultVal={DEFAULT_GATES.blacklistMusicFilm}
            />
            <ToggleRow
              inline
              label="Tech & gadget reviews"
              help={<>Blocks pure tech-review channels (Trakin Tech, TechBurner, Technical Guruji, Gadgets360, smartphone/laptop/mobile reviewers). Stops trimmer reviews from ending up in grooming results.</>}
              value={cfg.blacklistTechElectronics}
              onToggle={(v) => update('blacklistTechElectronics', v)}
              defaultVal={DEFAULT_GATES.blacklistTechElectronics}
            />
            <ToggleRow
              inline
              label="Motivational & self-help"
              help={<>Blocks self-help / life-coaching / Bhagavad Gita / study-hacks / &ldquo;decoding success&rdquo; / Brahma Muhurta / law-of-attraction / productivity-guru content. Added after the Decoding Success Kannada slip-through.</>}
              value={cfg.blacklistMotivational}
              onToggle={(v) => update('blacklistMotivational', v)}
              defaultVal={DEFAULT_GATES.blacklistMotivational}
            />
          </div>

          {/* User learnings */}
          <ToggleRow
            label={'Apply "Not relevant" learnings'}
            help={<>When on, every creator you&rsquo;ve flagged as not-relevant on past results continues to be filtered out on new searches (plus any channels matching the keywords Claude extracted). Turn off to pause that filter without clearing your saved learnings.</>}
            value={cfg.applyUserLearnings}
            onToggle={(v) => update('applyUserLearnings', v)}
            defaultVal={DEFAULT_GATES.applyUserLearnings}
          />
        </div>

        <div className="gm-foot">
          <button
            type="button"
            className="gm-btn"
            onClick={onResetAll}
            disabled={isDefault}
          >↺ Reset all to defaults</button>
          <div className="gm-foot-right">
            <button type="button" className="gm-btn" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="gm-btn primary"
              onClick={onSave}
              disabled={!dirty}
            >Save &amp; apply on next search</button>
          </div>
        </div>
      </div>
    </>
  );
}

function ToggleRow({ label, help, value, onToggle, defaultVal, inline }) {
  const isCustom = value !== defaultVal;
  return (
    <div className={`gm-section${inline ? ' inline' : ''}`}>
      <div className="gm-section-head">
        <div className="gm-label">
          {label}
          {isCustom && <span className="gm-diff"> · custom</span>}
        </div>
        <button
          type="button"
          className={`gm-toggle${value ? ' on' : ''}`}
          onClick={() => onToggle(!value)}
          aria-pressed={value}
          aria-label={label}
        >
          <span className="gm-toggle-knob" />
          <span className="gm-toggle-label">{value ? 'on' : 'off'}</span>
        </button>
      </div>
      {help && <div className="gm-help">{help}</div>}
    </div>
  );
}
