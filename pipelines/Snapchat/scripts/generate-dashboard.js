#!/usr/bin/env node

/**
 * Generate an HTML health dashboard from the latest health_report.json.
 * Output: output/health_dashboard.html — single file, inline CSS, works offline.
 *
 * Can be run standalone or called from run-pipeline.js after each run.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUTPUT_DIR = join(ROOT, 'output');
const DATA_DIR = join(ROOT, 'data');

export function generateDashboard(metrics, runHistory = []) {
  const tierColors = {
    tier1: metrics.tierPercentages?.tier1 > 80 ? '#22c55e' : metrics.tierPercentages?.tier1 > 60 ? '#eab308' : '#ef4444',
    tier2: '#3b82f6',
    tier3: '#a855f7',
    tier4: '#6b7280',
  };

  const warningsHtml = (metrics.warnings || []).map(w =>
    `<div class="warning">${escHtml(w)}</div>`
  ).join('\n') || '<div class="ok">No warnings</div>';

  const canariesHtml = (metrics.canaryResults || []).map(c => {
    const icon = c.passed ? 'PASS' : 'FAIL';
    const cls = c.passed ? 'pass' : 'fail';
    const checks = (c.checks || []).map(ch =>
      `<span class="${ch.passed ? 'pass' : 'fail'}">${ch.field}: ${ch.value ?? 'null'} (expected ${ch.expected.min}-${ch.expected.max})</span>`
    ).join(', ');
    return `<tr><td class="${cls}">${icon}</td><td>@${escHtml(c.handle)}</td><td>Tier ${c.extractionTier || '?'}</td><td>${checks || c.error || ''}</td></tr>`;
  }).join('\n') || '<tr><td colspan="4">No canary profiles configured</td></tr>';

  const queriesHtml = (metrics.queryYields || []).map(q => {
    const icon = q.handlesFound > 0 ? 'YES' : 'NO';
    const cls = q.handlesFound > 0 ? 'pass' : 'fail';
    return `<tr><td class="${cls}">${icon}</td><td>${escHtml(q.query.slice(0, 60))}</td><td>${q.handlesFound}</td><td>${q.source}</td></tr>`;
  }).join('\n') || '<tr><td colspan="4">No query data</td></tr>';

  const gatesHtml = Object.entries(metrics.gateRejections || {}).map(([gate, count]) =>
    `<span class="gate-chip">${gate}: ${count}</span>`
  ).join(' ') || 'No rejections';

  const scoresDist = metrics.scoreDistribution || {};
  const scoresHtml = ['excellent', 'strong', 'moderate', 'weak', 'poor'].map(k =>
    `<span class="score-chip score-${k}">${k}: ${scoresDist[k] || 0}</span>`
  ).join(' ');

  // 30-day trend mini-chart (text-based)
  const last7 = (runHistory || []).slice(-7);
  const trendHtml = last7.length > 0
    ? last7.map(r => `<tr><td>${r.date?.split('T')[0]}</td><td>${r.tierPercentages?.tier1 ?? '?'}%</td><td>${r.totalEnriched}</td><td>${r.warnings}</td></tr>`).join('\n')
    : '<tr><td colspan="4">No history yet</td></tr>';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pipeline Health Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; padding: 24px; }
  h1 { font-size: 1.5rem; margin-bottom: 8px; }
  .subtitle { color: #94a3b8; font-size: 0.85rem; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
  .card { background: #1e293b; border-radius: 12px; padding: 20px; border: 1px solid #334155; }
  .card h2 { font-size: 1.1rem; margin-bottom: 12px; color: #f8fafc; }
  .warning { background: #422006; border-left: 3px solid #f59e0b; padding: 8px 12px; margin: 4px 0; border-radius: 4px; font-size: 0.85rem; }
  .ok { color: #22c55e; font-size: 0.9rem; }
  .tier-bar { display: flex; height: 32px; border-radius: 6px; overflow: hidden; margin: 8px 0; }
  .tier-bar div { display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 600; color: #fff; min-width: 30px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th, td { padding: 6px 8px; text-align: left; border-bottom: 1px solid #334155; }
  th { color: #94a3b8; font-weight: 500; }
  .pass { color: #22c55e; } .fail { color: #ef4444; }
  .gate-chip, .score-chip { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; margin: 2px; background: #334155; }
  .score-excellent { background: #166534; } .score-strong { background: #1e40af; }
  .score-moderate { background: #854d0e; } .score-weak { background: #7f1d1d; }
  .score-poor { background: #450a0a; }
  .stat { font-size: 2rem; font-weight: 700; }
  .stat-label { font-size: 0.8rem; color: #94a3b8; }
  .full-width { grid-column: 1 / -1; }
</style>
</head>
<body>
<h1>Pipeline Health Dashboard</h1>
<p class="subtitle">ShareChat Influencer Scouting - Run: ${escHtml(metrics.runStartedAt || 'unknown')} - Duration: ${metrics.duration || '?'}s</p>

<div class="grid">
  <div class="card">
    <h2>Run Summary</h2>
    <div class="stat">${metrics.totalEnriched || 0}</div>
    <div class="stat-label">Profiles Enriched</div>
  </div>
  <div class="card">
    <h2>Warnings</h2>
    ${warningsHtml}
  </div>
</div>

<div class="grid">
  <div class="card full-width">
    <h2>Extraction Tier Usage</h2>
    <div class="tier-bar">
      <div style="width:${metrics.tierPercentages?.tier1 || 0}%;background:${tierColors.tier1}">T1 ${metrics.tierPercentages?.tier1 || 0}%</div>
      <div style="width:${metrics.tierPercentages?.tier2 || 0}%;background:${tierColors.tier2}">T2 ${metrics.tierPercentages?.tier2 || 0}%</div>
      <div style="width:${metrics.tierPercentages?.tier3 || 0}%;background:${tierColors.tier3}">T3 ${metrics.tierPercentages?.tier3 || 0}%</div>
      <div style="width:${metrics.tierPercentages?.tier4 || 0}%;background:${tierColors.tier4}">T4 ${metrics.tierPercentages?.tier4 || 0}%</div>
    </div>
    <p style="font-size:0.8rem;color:#94a3b8">T1=Standards (free) | T2=Regex (free) | T3=LLM ($0.002/ea) | T4=Cache (stale)</p>
  </div>
</div>

<div class="grid">
  <div class="card">
    <h2>Canary Profile Tests</h2>
    <table><tr><th></th><th>Handle</th><th>Tier</th><th>Checks</th></tr>${canariesHtml}</table>
  </div>
  <div class="card">
    <h2>Discovery Query Yield</h2>
    <table><tr><th></th><th>Query</th><th>Found</th><th>Source</th></tr>${queriesHtml}</table>
  </div>
</div>

<div class="grid">
  <div class="card">
    <h2>Gate Rejections</h2>
    <p>${gatesHtml}</p>
  </div>
  <div class="card">
    <h2>Score Distribution</h2>
    <p>${scoresHtml}</p>
  </div>
</div>

<div class="grid">
  <div class="card full-width">
    <h2>Recent Run History (last 7)</h2>
    <table><tr><th>Date</th><th>Tier 1 %</th><th>Enriched</th><th>Warnings</th></tr>${trendHtml}</table>
  </div>
</div>

<p style="text-align:center;color:#475569;font-size:0.75rem;margin-top:24px">Generated by GCPL ShareChat Scouting Pipeline - ${new Date().toISOString()}</p>
</body>
</html>`;

  return html;
}

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Standalone entry point ───

const isMain = process.argv[1]?.includes('generate-dashboard');
if (isMain) {
  const reportPath = join(OUTPUT_DIR, 'health_report.json');
  if (!existsSync(reportPath)) {
    console.log('No health_report.json found. Run the pipeline first.');
    process.exit(0);
  }
  const metrics = JSON.parse(readFileSync(reportPath, 'utf-8'));

  let history = [];
  const historyPath = join(DATA_DIR, 'run_history.json');
  if (existsSync(historyPath)) {
    history = JSON.parse(readFileSync(historyPath, 'utf-8'));
  }

  const html = generateDashboard(metrics, history);
  const outPath = join(OUTPUT_DIR, 'health_dashboard.html');
  writeFileSync(outPath, html);
  console.log(`Dashboard written to ${outPath}`);
}
