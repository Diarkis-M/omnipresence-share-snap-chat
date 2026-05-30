'use client';

// ── Scout history & dossier management ──
// All localStorage-backed. Survives across sessions.

const HISTORY_KEY = 'scoutHistory';
const DOSSIER_KEY = 'scoutDossiers';

// ── History ──

export function getScoutHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveScoutToHistory(criteria, results) {
  try {
    const history = getScoutHistory();
    const entry = {
      id: 'scout_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      ts: new Date().toISOString(),
      criteria,
      resultCount: results.length,
      results,
    };
    history.unshift(entry);
    if (history.length > 50) history.length = 50;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    return entry.id;
  } catch { return null; }
}

export function getScoutById(id) {
  return getScoutHistory().find(s => s.id === id) || null;
}

export function deleteScout(id) {
  try {
    const history = getScoutHistory().filter(s => s.id !== id);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {}
}

// Category counts from history (run counts)
export function getCategoryCounts() {
  const history = getScoutHistory();
  const counts = {};
  for (const scout of history) {
    const cat = scout.criteria?.category || 'Unknown';
    counts[cat] = (counts[cat] || 0) + 1;
  }
  return counts;
}

// Unique-creator counts per category (for sidebar badges)
export function getCategoryCreatorCounts() {
  const history = getScoutHistory();
  const byCategory = {};
  for (const scout of history) {
    const cat = scout.criteria?.category || 'Unknown';
    if (!byCategory[cat]) byCategory[cat] = new Set();
    for (const r of (scout.results || [])) {
      const id = r.channelId || '';
      if (id) byCategory[cat].add((r.platform || 'youtube') + ':' + id);
    }
  }
  const counts = {};
  for (const [cat, set] of Object.entries(byCategory)) counts[cat] = set.size;
  return counts;
}

// Aggregate all unique creators across runs for a given category.
// De-dupes by platform:channelId, keeps the best PCF score.
export function getAggregatedCreators(category) {
  const history = getScoutHistory();
  const filtered = category
    ? history.filter(s => s.criteria?.category === category)
    : history;

  const map = {};

  for (const scout of filtered) {
    for (const r of (scout.results || [])) {
      const plat = r.platform || 'youtube';
      const id = r.channelId || '';
      if (!id) continue;
      const key = plat + ':' + id;

      const overall = r.analysis?.pcf_score?.overall;
      const score = typeof overall === 'number' ? Math.round(overall) : 0;

      const existing = map[key];
      if (!existing) {
        map[key] = {
          channelName: r.channelName || id,
          channelId: id,
          platform: plat,
          subscriberCount: r.subscriberCount || 0,
          pcf: score,
          analysis: r.analysis,
          searchLanguage: r.searchLanguage,
          runCount: 1,
        };
      } else {
        existing.runCount++;
        if (score > existing.pcf) {
          existing.pcf = score;
          existing.analysis = r.analysis;
        }
        if (r.subscriberCount && r.subscriberCount > existing.subscriberCount) {
          existing.subscriberCount = r.subscriberCount;
        }
        if (r.channelName && r.channelName !== id) {
          existing.channelName = r.channelName;
        }
      }
    }
  }

  return Object.values(map);
}

// Group history entries by human-readable date label
export function groupByDate(history) {
  const groups = {};
  const order = [];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);

  for (const scout of history) {
    const d = new Date(scout.ts);
    const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    let label;
    if (dDay.getTime() === today.getTime()) label = 'Today';
    else if (dDay.getTime() === yesterday.getTime()) label = 'Yesterday';
    else if (dDay >= weekAgo) label = 'This week';
    else label = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

    if (!groups[label]) { groups[label] = []; order.push(label); }
    groups[label].push(scout);
  }
  return { groups, order };
}

// ── Dossiers ──

export function getDossiers() {
  try {
    const raw = localStorage.getItem(DOSSIER_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveToDossier(creators, criteria) {
  try {
    const dossiers = getDossiers();
    dossiers.unshift({
      id: 'dossier_' + Date.now(),
      ts: new Date().toISOString(),
      criteria,
      creators,
      creatorCount: creators.length,
    });
    if (dossiers.length > 30) dossiers.length = 30;
    localStorage.setItem(DOSSIER_KEY, JSON.stringify(dossiers));
  } catch {}
}

export function deleteDossier(id) {
  try {
    const dossiers = getDossiers().filter(d => d.id !== id);
    localStorage.setItem(DOSSIER_KEY, JSON.stringify(dossiers));
  } catch {}
}

// ── Scouted Creators Registry ──
// Tracks every creator ever returned by a scout run.
// Keyed by "platform:channelId". Capped at 500 per category.
// On cap hit, oldest entries are archived to a downloadable text file.

const SCOUTED_KEY = 'scoutedCreators';
const ARCHIVE_KEY = 'scoutedCreatorsArchive';
const CAP_PER_CATEGORY = 500;

export function getScoutedCreators() {
  try {
    const raw = localStorage.getItem(SCOUTED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveScoutedCreators(registry) {
  try { localStorage.setItem(SCOUTED_KEY, JSON.stringify(registry)); } catch {}
}

function getArchive() {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveArchive(archive) {
  try { localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archive)); } catch {}
}

// Build a profile URL from platform + id
function profileUrl(platform, channelId) {
  if (platform === 'instagram') return 'https://instagram.com/' + channelId;
  return 'https://youtube.com/channel/' + channelId;
}

// Register creators from a completed scout run into the registry.
// Called at the end of Stage IV in processing.
export function registerScoutedCreators(results, category) {
  const registry = getScoutedCreators();
  const now = new Date().toISOString();

  for (const r of results) {
    const plat = r.platform || 'youtube';
    const id = r.channelId || '';
    if (!id) continue;
    const key = plat + ':' + id;

    if (registry[key]) {
      registry[key].scoutCount = (registry[key].scoutCount || 1) + 1;
    } else {
      registry[key] = {
        channelName: r.channelName || id,
        channelId: id,
        platform: plat,
        category: category,
        subscriberCount: r.subscriberCount || 0,
        firstSeen: now,
        scoutCount: 1,
      };
    }
  }

  // Check cap per category — archive overflow
  const byCategory = {};
  for (const [key, entry] of Object.entries(registry)) {
    const cat = entry.category || 'Unknown';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push({ key, ...entry });
  }

  for (const [cat, entries] of Object.entries(byCategory)) {
    if (entries.length > CAP_PER_CATEGORY) {
      // Sort oldest-first
      entries.sort((a, b) => new Date(a.firstSeen) - new Date(b.firstSeen));
      const overflow = entries.length - CAP_PER_CATEGORY;
      const toArchive = entries.slice(0, overflow);

      // Add to persistent archive
      const archive = getArchive();
      if (!archive[cat]) archive[cat] = [];
      for (const entry of toArchive) {
        archive[cat].push({
          channelName: entry.channelName,
          channelId: entry.channelId,
          platform: entry.platform,
          url: profileUrl(entry.platform, entry.channelId),
          subscriberCount: entry.subscriberCount,
          firstSeen: entry.firstSeen,
          scoutCount: entry.scoutCount,
          archivedAt: now,
        });
        delete registry[entry.key];
      }
      saveArchive(archive);

      // Auto-download archive text file for this category
      downloadArchiveFile(cat, archive[cat]);
    }
  }

  saveScoutedCreators(registry);
}

// Get count and IDs of past creators matching search criteria
export function getPastCreatorsForSearch(category, platform) {
  const registry = getScoutedCreators();
  const matches = [];
  for (const [key, entry] of Object.entries(registry)) {
    if (entry.category !== category) continue;
    // Match platform: 'both' matches everything, otherwise must match
    if (platform !== 'both' && entry.platform !== platform) continue;
    matches.push({ key, ...entry });
  }
  return matches;
}

// Get a Set of "platform:channelId" keys to exclude
export function getExclusionSet(category, platform) {
  const matches = getPastCreatorsForSearch(category, platform);
  return new Set(matches.map(m => m.key));
}

// Generate and trigger download of a category archive text file
function downloadArchiveFile(category, entries) {
  if (!entries || entries.length === 0) return;
  if (typeof document === 'undefined') return;

  const shortCat = category.split('&')[0].trim().replace(/\s+/g, '_');
  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
  const timeStr = new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });

  let text = 'MUUCHSTAC SCOUT — ARCHIVED CREATORS\n';
  text += 'Category: ' + category + '\n';
  text += 'Generated: ' + dateStr + ', ' + timeStr + '\n';
  text += 'Total archived: ' + entries.length + ' creators\n';
  text += '═'.repeat(52) + '\n\n';

  entries.forEach((e, i) => {
    text += (i + 1) + '. ' + (e.channelName || e.channelId) + '\n';
    text += '   Platform: ' + (e.platform === 'instagram' ? 'Instagram' : 'YouTube') + '\n';
    text += '   URL: ' + (e.url || profileUrl(e.platform, e.channelId)) + '\n';
    if (e.subscriberCount) {
      const k = e.subscriberCount >= 1e6
        ? (e.subscriberCount / 1e6).toFixed(1) + 'M'
        : e.subscriberCount >= 1000
          ? Math.round(e.subscriberCount / 1000) + 'K'
          : String(e.subscriberCount);
      text += '   Subscribers: ' + k + '\n';
    }
    text += '   First scouted: ' + new Date(e.firstSeen).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) + '\n';
    text += '   Times appeared: ' + (e.scoutCount || 1) + '\n';
    if (e.archivedAt) {
      text += '   Archived: ' + new Date(e.archivedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) + '\n';
    }
    text += '\n';
  });

  text += '═'.repeat(52) + '\n';
  text += 'End of archive. ' + entries.length + ' creators total.\n';

  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'scout_archive_' + shortCat + '_' + Date.now() + '.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Manually export archive for a category (called from UI)
export function exportCategoryArchive(category) {
  const archive = getArchive();
  const registry = getScoutedCreators();

  // Combine active + archived entries for the full picture
  const active = [];
  for (const [key, entry] of Object.entries(registry)) {
    if (entry.category === category) {
      active.push({
        ...entry,
        url: profileUrl(entry.platform, entry.channelId),
      });
    }
  }
  const archived = archive[category] || [];
  const combined = [...active, ...archived];
  combined.sort((a, b) => new Date(a.firstSeen) - new Date(b.firstSeen));

  if (combined.length === 0) return;
  downloadArchiveFile(category, combined);
}

// ── Active-result flag (session-scoped) ──

export function setResultsActive() {
  try { sessionStorage.setItem('scoutResultsActive', 'true'); } catch {}
}

export function clearResultsActive() {
  try { sessionStorage.removeItem('scoutResultsActive'); } catch {}
}

export function isResultsActive() {
  try { return sessionStorage.getItem('scoutResultsActive') === 'true'; } catch { return false; }
}

export function isRunActive() {
  try { return !!sessionStorage.getItem('scoutPendingSearch'); } catch { return false; }
}
