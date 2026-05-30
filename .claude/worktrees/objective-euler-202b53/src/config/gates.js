/**
 * Tunable gates + filters — single source of truth for every rule the
 * pipeline enforces on top of the raw API results.
 *
 * Precedence: user overrides (localStorage.scoutGateConfig) merge on top
 * of DEFAULT_GATES. The client ships the merged config with every search
 * request; server routes parse it and pass it through the pipeline.
 */

export const DEFAULT_DIMENSION_WEIGHTS = {
  engagement_quality: 25,
  reach_relevance: 25,
  growth_potential: 20,
  parasocial_depth: 18,
  brand_fit: 12,
};

export const DEFAULT_GATES = {
  geographyGateEnabled: true,
  strictRegionalLanguage: true,
  blacklistNewsPolitics: true,
  blacklistMusicFilm: true,
  blacklistTechElectronics: true,
  blacklistMotivational: true,
  applyUserLearnings: true,
  dimensionWeights: { ...DEFAULT_DIMENSION_WEIGHTS },
  // Theme: 'stone' (default neutral), 'carbon' (dark), 'gcpl' (brand)
  theme: 'stone',
};

export const THEME_OPTIONS = [
  { value: 'stone',  label: 'Stone',        sub: 'Default · neutral · minimal', sw: ['#FAFAFA','#0A0A0A','#16A34A'] },
  { value: 'carbon', label: 'Carbon',       sub: 'Dark mode · low-glare',       sw: ['#0E1014','#E7E9EE','#F59E0B'] },
  { value: 'gcpl',   label: 'GCPL · Brand', sub: 'Parrot green · ethnic magenta · compose blue', sw: ['#FBF9F4','#1A1816','#5FB233','#BD1362','#4187CE'] },
];

export const MOMENTUM_SPEC = {
  accelerating: { label: 'Accelerating', glyph: '▲', tone: 'success',  desc: 'Upload pace climbing' },
  active:       { label: 'Active',       glyph: '●', tone: 'success',  desc: 'Steady high cadence' },
  steady:       { label: 'Steady',       glyph: '—', tone: 'neutral',  desc: 'Consistent pace' },
  slowing:      { label: 'Slowing',      glyph: '▼', tone: 'warning',  desc: 'Pace dropping' },
  dormant:      { label: 'Dormant',      glyph: '✕', tone: 'danger',   desc: 'No recent activity' },
  'low-signal': { label: 'Insufficient', glyph: '?',      tone: 'muted',    desc: 'Too few videos in window' },
};

/** Shape-check + merge user overrides on top of the defaults. */
export function mergeGates(overrides) {
  if (!overrides || typeof overrides !== 'object') return { ...DEFAULT_GATES, dimensionWeights: { ...DEFAULT_DIMENSION_WEIGHTS } };
  const out = { ...DEFAULT_GATES };
  for (const key of Object.keys(DEFAULT_GATES)) {
    if (key === 'dimensionWeights') continue; // handled below
    if (overrides[key] !== undefined) out[key] = overrides[key];
  }
  // Merge dimension weights — validate they sum to 100
  if (overrides.dimensionWeights && typeof overrides.dimensionWeights === 'object') {
    const w = { ...DEFAULT_DIMENSION_WEIGHTS };
    for (const k of Object.keys(DEFAULT_DIMENSION_WEIGHTS)) {
      if (typeof overrides.dimensionWeights[k] === 'number') {
        w[k] = Math.max(0, Math.min(100, overrides.dimensionWeights[k]));
      }
    }
    const sum = Object.values(w).reduce((s, v) => s + v, 0);
    out.dimensionWeights = sum === 100 ? w : { ...DEFAULT_DIMENSION_WEIGHTS };
  } else {
    out.dimensionWeights = { ...DEFAULT_DIMENSION_WEIGHTS };
  }
  // Migrate legacy bharatMinScore — ignore it silently
  delete out.bharatMinScore;
  const validThemes = new Set(THEME_OPTIONS.map((t) => t.value));
  if (!validThemes.has(out.theme)) out.theme = DEFAULT_GATES.theme;
  return out;
}

/** Apply theme attribute on <html> */
export function applyThemeLive(theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('scout.theme', theme); } catch {}
}

// Keep old name for backward compatibility
export const applyPaletteLive = applyThemeLive;

export function loadGateOverrides() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem('scoutGateConfig');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function getActiveGates() {
  return mergeGates(loadGateOverrides());
}

export function saveGateOverrides(overrides) {
  if (typeof window === 'undefined') return;
  try {
    if (!overrides || Object.keys(overrides).length === 0) {
      window.localStorage.removeItem('scoutGateConfig');
    } else {
      window.localStorage.setItem('scoutGateConfig', JSON.stringify(overrides));
    }
  } catch {}
}
