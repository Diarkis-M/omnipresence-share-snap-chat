/**
 * Muuchstac Scout — PDF Report Generator v2
 *
 * Professional influencer scouting report.
 * Full PCF analysis, evidence, comment patterns, brutal recommendations.
 *
 * Palette: Godrej corporate neutral — grey-dominant, single blue accent.
 */

import { jsPDF } from 'jspdf';
import { formatSubscribers, getScoreLabel, getCostLabel } from './scoring';

// ── Palette ──
const C = {
  BLACK:   '#000000',
  INK:     '#1A1A1A',
  BODY:    '#2D2D2D',
  CAPTION: '#666666',
  MUTED:   '#999999',
  RULE:    '#C8C8C8',
  PALE:    '#EEEEEE',
  WHITE:   '#FFFFFF',
  SKY:     '#5BC8FF',
  BLUE:    '#2B95DA',
  DARK:    '#3D3D3D',
  WARN:    '#C53030',
  AMBER:   '#B87A00',
};

const M = { L: 20, R: 20, T: 15, B: 22 }; // margins
const PW = 210; // page width (A4)
const PH = 297;
const CW = PW - M.L - M.R; // content width

function hex(c) {
  const h = c.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function truncate(doc, text, maxW) {
  if (!text) return '';
  if (doc.getTextWidth(text) <= maxW) return text;
  let t = text;
  while (doc.getTextWidth(t + '…') > maxW && t.length > 0) t = t.slice(0, -1);
  return t + '…';
}

function wrapText(doc, text, maxW) {
  if (!text) return [''];
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (doc.getTextWidth(test) > maxW) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines.length > 0 ? lines : [''];
}

/** Ensure vertical space; adds new page if needed. Returns { y, pageNum }. */
function checkPage(doc, y, needed, pageNum) {
  if (y + needed > PH - M.B) {
    drawFooter(doc, pageNum);
    doc.addPage();
    pageNum++;
    pageStart(doc);
    return { y: M.T + 8, pageNum };
  }
  return { y, pageNum };
}

/** White background + thin top accent. */
function pageStart(doc) {
  doc.setFillColor(...hex(C.WHITE));
  doc.rect(0, 0, PW, PH, 'F');
  doc.setFillColor(...hex(C.BLUE));
  doc.rect(0, 0, PW, 2.5, 'F');
}

function drawFooter(doc, pageNum) {
  doc.setDrawColor(...hex(C.RULE));
  doc.setLineWidth(0.25);
  doc.line(M.L, PH - 14, PW - M.R, PH - 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...hex(C.MUTED));
  doc.text('Muuchstac Scout  ·  GCPL Gurukul 2026  ·  Confidential', M.L, PH - 9);
  doc.text('Page ' + pageNum, PW - M.R, PH - 9, { align: 'right' });
}

function sectionLabel(doc, y, title) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...hex(C.WHITE));
  doc.setFillColor(...hex(C.INK));
  doc.rect(M.L, y, CW, 8, 'F');
  doc.text(title.toUpperCase(), M.L + 4, y + 5.5);
  return y + 11;
}

function thinRule(doc, y) {
  doc.setDrawColor(...hex(C.RULE));
  doc.setLineWidth(0.2);
  doc.line(M.L, y, PW - M.R, y);
}

// ── Pick best sample comments ──
function pickComments(comments, max = 6) {
  if (!comments || comments.length === 0) return [];
  const cleaned = comments
    .filter(c => typeof c === 'string' && c.trim().length >= 18)
    .map(c => c.replace(/<[^>]+>/g, '').trim())
    .filter(c => c.length >= 18 && c.length <= 350);

  const high = [];
  const normal = [];
  for (const c of cleaned) {
    const lc = c.toLowerCase();
    if (/\b(bought|ordered|tried|using|purchase|recommend|trust|skin cleared|works|effective|changed|difference|result|switched)\b/.test(lc)) {
      high.push(c);
    } else if (c.length >= 35) {
      normal.push(c);
    }
  }
  normal.sort((a, b) => b.length - a.length);
  return [...high.slice(0, 3), ...normal].slice(0, max);
}

// ── Brutal recommendation generator ──
function buildBrutalRec(result) {
  const a = result.analysis;
  const overall = a.pcf_score.overall;
  const fraud = a.fraud_signals;
  const cost = getCostLabel(a.recommendation.estimated_cost_tier);
  const format = a.recommendation.suggested_content_format || 'dedicated content';
  const para = a.parasocial_indicators || {};
  const sent = a.sentiment_breakdown;

  const dims = [
    { name: 'Reach', key: 'reach_relevance' },
    { name: 'Engagement', key: 'engagement_quality' },
    { name: 'Parasocial', key: 'parasocial_depth' },
    { name: 'Brand Fit', key: 'brand_fit' },
    { name: 'Growth', key: 'growth_potential' },
  ].map(d => {
    const obj = a.pcf_score[d.key] || {};
    return { ...d, score: obj.score || 0, reasoning: obj.reasoning || '' };
  }).filter(d => d.score > 0 && !d.reasoning.startsWith('Excluded'));

  dims.sort((a, b) => b.score - a.score);
  const top = dims[0] || { name: 'N/A', score: 0 };
  const bottom = dims[dims.length - 1] || { name: 'N/A', score: 0 };

  let rec = '';

  if (overall >= 80) {
    rec = `VERDICT: STRONG YES. This creator is a top-tier candidate. ${top.name} stands out at ${top.score}/100. `;
    if (fraud.risk_level === 'low') rec += 'No fraud concerns detected. ';
    else rec += `Flag: ${fraud.risk_level} fraud risk — ${fraud.explanation || 'review manually'}. `;
    rec += `Recommended: lock in a ${format} deal at ${cost} before competitors approach. `;
    if (bottom.score < 55) rec += `Caveat: ${bottom.name} is weaker at ${bottom.score} — brief the creator on this.`;
    if (para.purchase_intent_signals === 'high') rec += ' Audience shows strong purchase intent — commercial value is real.';
  } else if (overall >= 60) {
    rec = `VERDICT: CONDITIONAL YES. Viable but not a slam dunk. `;
    rec += `Strongest: ${top.name} (${top.score}). Weakest: ${bottom.name} (${bottom.score}). `;
    if (fraud.risk_level !== 'low') rec += `Fraud flag: ${fraud.explanation || fraud.risk_level + ' risk'}. `;
    if (para.purchase_intent_signals === 'high' || para.purchase_intent_signals === 'moderate') {
      rec += 'Audience shows purchase intent — commercial value exists. ';
    }
    rec += `Start with a low-commitment ${cost} pilot using ${format}. `;
    rec += `If ${bottom.name} improves over the pilot, scale up. Otherwise, do not renew.`;
  } else if (overall >= 40) {
    rec = `VERDICT: PROBABLY NOT. The numbers do not justify the spend. `;
    rec += `${bottom.name} is critically weak at ${bottom.score}. `;
    if (top.score >= 60) rec += `${top.name} (${top.score}) is decent, but one strong dimension does not compensate. `;
    if (sent.negative_percent > 20) rec += `Red flag: ${sent.negative_percent}% negative sentiment. `;
    if (fraud.risk_level === 'high') rec += `High fraud risk: ${fraud.explanation || 'engagement anomalies'}. `;
    rec += 'Only consider if no better options exist in this niche AND the deal is barter-only.';
  } else {
    rec = `VERDICT: HARD PASS. Overall score of ${overall} indicates fundamental misalignment. `;
    if (fraud.risk_level === 'high') rec += `High fraud risk: ${fraud.explanation || 'engagement anomalies'}. `;
    if (sent.negative_percent > 30) rec += `${sent.negative_percent}% negative audience sentiment is a brand risk. `;
    rec += 'Do not invest budget or brand equity here. Move on.';
  }

  return rec;
}

// ═══════════════════════════════════════════════════════════════
//  COVER PAGE
// ═══════════════════════════════════════════════════════════════

function drawCover(doc, criteria, count, date, platLabel) {
  doc.setFillColor(...hex(C.BLACK));
  doc.rect(0, 0, PW, PH, 'F');

  // Top accent
  doc.setFillColor(...hex(C.BLUE));
  doc.rect(0, 0, PW, 3, 'F');

  // Title block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(32);
  doc.setTextColor(...hex(C.WHITE));
  doc.text('MUUCHSTAC', PW / 2, 95, { align: 'center' });
  doc.text('SCOUT', PW / 2, 110, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(...hex(C.BLUE));
  doc.text('Influencer Scouting Report', PW / 2, 126, { align: 'center' });

  // Thin divider
  doc.setDrawColor(...hex(C.DARK));
  doc.setLineWidth(0.3);
  doc.line(70, 135, PW - 70, 135);

  // Metadata
  const bx = M.L + 20;
  let by = 152;
  const metaRows = [
    ['BRAND', criteria?.brandContext || 'GCPL (Godrej Consumer Products)'],
    ['CATEGORY', criteria?.category || 'N/A'],
    ['PLATFORM', platLabel || 'YouTube'],
    ['CREATORS ANALYZED', String(count)],
    ['DATE', date],
  ];

  doc.setFontSize(8);
  metaRows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...hex(C.MUTED));
    doc.text(label, bx, by);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...hex(C.WHITE));
    doc.text(value, bx + 55, by);
    by += 11;
  });

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(...hex(C.MUTED));
  doc.text('Powered by Claude AI  ·  Parasocial Capital Framework', PW / 2, PH - 22, { align: 'center' });
  doc.text('GCPL Gurukul 2026  ·  Confidential', PW / 2, PH - 14, { align: 'center' });
}

// ═══════════════════════════════════════════════════════════════
//  EXECUTIVE SUMMARY
// ═══════════════════════════════════════════════════════════════

function drawExecutiveSummary(doc, results, criteria) {
  pageStart(doc);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...hex(C.INK));
  doc.text('Executive Summary', M.L, 22);
  thinRule(doc, 27);

  // ── Stats row ──
  const avgScore = Math.round(results.reduce((s, r) => s + (r.analysis?.pcf_score?.overall || 0), 0) / results.length);
  const strong = results.filter(r => (r.analysis?.pcf_score?.overall || 0) >= 80).length;
  const moderate = results.filter(r => { const s = r.analysis?.pcf_score?.overall || 0; return s >= 60 && s < 80; }).length;
  const weak = results.filter(r => (r.analysis?.pcf_score?.overall || 0) < 60).length;
  const highFraud = results.filter(r => r.analysis?.fraud_signals?.risk_level === 'high').length;

  let y = 36;
  const stats = [
    { label: 'TOTAL', value: String(results.length), color: C.INK },
    { label: 'AVG SCORE', value: String(avgScore), color: C.BLUE },
    { label: 'STRONG FIT', value: String(strong), color: C.BLUE },
    { label: 'MODERATE', value: String(moderate), color: C.DARK },
    { label: 'WEAK / PASS', value: String(weak), color: C.MUTED },
  ];

  const boxW = (CW - 16) / 5;
  stats.forEach((st, i) => {
    const x = M.L + i * (boxW + 4);
    doc.setFillColor(...hex(C.PALE));
    doc.rect(x, y, boxW, 24, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...hex(st.color));
    doc.text(st.value, x + boxW / 2, y + 12, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...hex(C.CAPTION));
    doc.text(st.label, x + boxW / 2, y + 20, { align: 'center' });
  });

  y += 34;

  // ── Score Distribution ──
  y = sectionLabel(doc, y, 'PCF Score Distribution');

  const sorted = [...results].sort((a, b) => (b.analysis?.pcf_score?.overall || 0) - (a.analysis?.pcf_score?.overall || 0));
  const chartX = M.L;
  const labelW = 58;
  const barMaxW = CW - labelW - 20;
  const barH = 10;

  sorted.slice(0, 12).forEach((r, i) => {
    const barY = y + i * (barH + 3);
    const score = r.analysis?.pcf_score?.overall || 0;
    const barLen = (score / 100) * barMaxW;
    const barColor = score >= 80 ? C.BLUE : score >= 60 ? C.DARK : C.MUTED;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...hex(C.BODY));
    doc.text(truncate(doc, r.channelName, labelW - 4), chartX, barY + 7);

    // Track
    doc.setFillColor(...hex(C.PALE));
    doc.rect(chartX + labelW, barY + 1, barMaxW, barH - 2, 'F');
    // Fill
    doc.setFillColor(...hex(barColor));
    if (barLen > 0) doc.rect(chartX + labelW, barY + 1, barLen, barH - 2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...hex(barColor));
    doc.text(String(score), chartX + labelW + barMaxW + 4, barY + 7);
  });

  const chartEnd = y + Math.min(sorted.length, 12) * (barH + 3);

  // ── Fraud alert ──
  if (highFraud > 0) {
    const fy = chartEnd + 6;
    doc.setFillColor(...hex('#FEE8E8'));
    doc.rect(M.L, fy, CW, 12, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...hex(C.WARN));
    doc.text(`⚠  ${highFraud} creator${highFraud > 1 ? 's' : ''} flagged HIGH fraud risk — see individual pages`, M.L + 5, fy + 8);
  }
}

// ═══════════════════════════════════════════════════════════════
//  INDIVIDUAL CREATOR SECTION (flowing layout)
// ═══════════════════════════════════════════════════════════════

function drawCreatorSection(doc, result, rank, pageNum, dimWeights) {
  const a = result.analysis;
  const pcf = a.pcf_score;
  const overall = pcf.overall || 0;
  const isIG = result.platform === 'instagram';

  // Always start a new page for each creator
  doc.addPage();
  pageNum++;
  pageStart(doc);

  let y = M.T + 4;

  // ── Header ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...hex(C.BLUE));
  doc.text('#' + rank, M.L, y + 6);

  doc.setFontSize(16);
  doc.setTextColor(...hex(C.INK));
  doc.text(truncate(doc, result.channelName, CW - 50), M.L + 14, y + 6);

  // Score badge (right)
  const badgeColor = overall >= 80 ? C.BLUE : overall >= 60 ? C.DARK : overall >= 40 ? C.MUTED : C.WARN;
  doc.setFillColor(...hex(badgeColor));
  doc.rect(PW - M.R - 24, y - 1, 24, 14, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...hex(C.WHITE));
  doc.text(String(overall), PW - M.R - 12, y + 8, { align: 'center' });

  y += 12;

  // Sub-header
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...hex(C.CAPTION));
  const subParts = [
    getScoreLabel(overall),
    isIG ? 'Instagram' : 'YouTube',
    formatSubscribers(result.subscriberCount) + (isIG ? ' followers' : ' subscribers'),
    a.content_classification?.language_mix || '',
    a.content_classification?.primary_niche || '',
  ].filter(Boolean);
  doc.text(subParts.join('  ·  '), M.L, y);

  y += 4;
  thinRule(doc, y);
  y += 6;

  // ── PCF SCORE BREAKDOWN ──
  y = sectionLabel(doc, y, 'PCF Score Breakdown');

  const dimDefs = [
    { key: 'reach_relevance', label: 'Reach Relevance' },
    { key: 'engagement_quality', label: 'Engagement Quality' },
    { key: 'parasocial_depth', label: 'Parasocial Depth' },
    { key: 'brand_fit', label: 'Brand Fit' },
    { key: 'growth_potential', label: 'Growth Potential' },
  ];

  for (const dim of dimDefs) {
    const obj = pcf[dim.key] || pcf.bharat_applicability || {};
    const score = obj.score || 0;
    const reasoning = obj.reasoning || '';
    const weight = dimWeights ? (dimWeights[dim.key] || 0) : null;

    // Skip excluded dimensions
    if (reasoning.startsWith('Excluded') || (weight !== null && weight === 0)) continue;

    // Check space: bar(8) + reasoning lines(~12-20) + gap(4) ≈ 30
    const reasonLines = wrapText(doc, reasoning, CW - 6);
    const blockH = 10 + reasonLines.length * 3.2 + 4;
    ({ y, pageNum } = checkPage(doc, y, blockH, pageNum));

    // Dim label + weight
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...hex(C.BODY));
    const weightStr = weight ? ` (${weight}%)` : '';
    doc.text(dim.label + weightStr, M.L, y + 5);

    // Score bar
    const barX = M.L + 62;
    const barW = CW - 62 - 18;
    doc.setFillColor(...hex(C.PALE));
    doc.rect(barX, y + 1, barW, 6, 'F');

    const barColor = score >= 80 ? C.BLUE : score >= 60 ? C.DARK : score >= 40 ? C.MUTED : C.WARN;
    if (score > 0) {
      doc.setFillColor(...hex(barColor));
      doc.rect(barX, y + 1, (score / 100) * barW, 6, 'F');
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...hex(barColor));
    doc.text(String(score), barX + barW + 3, y + 6);

    y += 10;

    // Full reasoning text
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...hex(C.CAPTION));
    reasonLines.forEach(line => {
      doc.text(line, M.L + 3, y);
      y += 3.2;
    });

    y += 3;
  }

  y += 2;

  // ── SENTIMENT ANALYSIS ──
  ({ y, pageNum } = checkPage(doc, y, 40, pageNum));
  y = sectionLabel(doc, y, 'Sentiment Analysis');

  const sent = a.sentiment_breakdown || {};
  const sentSegs = [
    { pct: sent.positive_percent || 0, color: C.BLUE, label: 'Positive' },
    { pct: sent.neutral_percent || 0, color: C.PALE, label: 'Neutral' },
    { pct: sent.negative_percent || 0, color: C.WARN, label: 'Negative' },
  ];

  // Stacked bar
  const sentBarW = CW - 10;
  let sx = M.L + 5;
  sentSegs.forEach(seg => {
    if (seg.pct <= 0) return;
    const w = (seg.pct / 100) * sentBarW;
    doc.setFillColor(...hex(seg.color));
    doc.rect(sx, y, w, 10, 'F');
    if (w > 16) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...hex(seg.color === C.PALE ? C.DARK : C.WHITE));
      doc.text(seg.pct + '%', sx + w / 2, y + 6.5, { align: 'center' });
    }
    sx += w;
  });
  y += 14;

  // Legend + themes
  let lx = M.L + 5;
  sentSegs.forEach(seg => {
    doc.setFillColor(...hex(seg.color));
    doc.rect(lx, y, 5, 5, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...hex(C.BODY));
    doc.text(`${seg.label} ${seg.pct}%`, lx + 7, y + 4);
    lx += 40;
  });
  y += 10;

  if (sent.key_positive_themes?.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...hex(C.CAPTION));
    doc.text('Positive themes: ' + sent.key_positive_themes.join(', '), M.L + 5, y);
    y += 5;
  }
  if (sent.key_negative_themes?.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...hex(C.CAPTION));
    doc.text('Negative themes: ' + sent.key_negative_themes.join(', '), M.L + 5, y);
    y += 5;
  }

  y += 4;

  // ── SAMPLE COMMENTS (evidence) ──
  const sampleComments = pickComments(result.comments || result._comments, 6);
  if (sampleComments.length > 0) {
    ({ y, pageNum } = checkPage(doc, y, 30, pageNum));
    y = sectionLabel(doc, y, 'Sample Comments (Evidence)');

    for (const comment of sampleComments) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(6.5);
      const lines = wrapText(doc, '“' + comment + '”', CW - 14);
      const blockH = lines.length * 3.2 + 4;

      ({ y, pageNum } = checkPage(doc, y, blockH, pageNum));

      // Grey left-bar quote styling
      doc.setDrawColor(...hex(C.RULE));
      doc.setLineWidth(0.6);
      doc.line(M.L + 3, y - 0.5, M.L + 3, y + lines.length * 3.2 + 0.5);

      doc.setTextColor(...hex(C.BODY));
      lines.forEach(line => {
        doc.text(line, M.L + 7, y);
        y += 3.2;
      });
      y += 2.5;
    }
    y += 2;
  }

  // ── COMMENT PATTERNS ──
  const para = a.parasocial_indicators || {};
  const hasPatterns = para.repeat_commenter_pattern || para.personal_storytelling_in_comments;

  if (hasPatterns) {
    ({ y, pageNum } = checkPage(doc, y, 44, pageNum));
    y = sectionLabel(doc, y, 'Comment Patterns');

    const patterns = [
      { label: 'Repeat commenters', value: para.repeat_commenter_pattern || 'N/A' },
      { label: 'Personal storytelling', value: para.personal_storytelling_in_comments || 'N/A' },
      { label: 'Creator reply engagement', value: para.creator_reply_engagement || 'N/A' },
      { label: 'Purchase intent signals', value: para.purchase_intent_signals || 'N/A' },
    ];

    patterns.forEach(p => {
      const valueColor = p.value === 'high' ? C.BLUE : p.value === 'moderate' ? C.DARK : C.MUTED;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...hex(C.BODY));
      doc.text(p.label + ':', M.L + 5, y);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...hex(valueColor));
      doc.text(p.value.toUpperCase(), M.L + 62, y);
      y += 5.5;
    });

    if (para.community_language_markers?.length > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...hex(C.CAPTION));
      doc.text('Community markers: ' + para.community_language_markers.join(', '), M.L + 5, y);
      y += 5.5;
    }
    y += 3;
  }

  // ── FRAUD ASSESSMENT ──
  ({ y, pageNum } = checkPage(doc, y, 30, pageNum));
  y = sectionLabel(doc, y, 'Fraud Assessment');

  const fraud = a.fraud_signals || {};
  const fraudColor = fraud.risk_level === 'low' ? C.BLUE : fraud.risk_level === 'high' ? C.WARN : C.AMBER;
  const fraudBg = fraud.risk_level === 'low' ? '#E8F4FD' : fraud.risk_level === 'high' ? '#FEE8E8' : '#FEF6E4';

  doc.setFillColor(...hex(fraudBg));
  doc.rect(M.L, y, CW, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...hex(fraudColor));
  doc.text('Risk Level: ' + (fraud.risk_level || 'unknown').toUpperCase(), M.L + 5, y + 5.5);
  y += 11;

  if (fraud.flags?.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...hex(C.BODY));
    const flagLines = wrapText(doc, 'Flags: ' + fraud.flags.join('; '), CW - 10);
    flagLines.forEach(line => {
      doc.text(line, M.L + 5, y);
      y += 3.2;
    });
    y += 1;
  }
  if (fraud.explanation) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...hex(C.CAPTION));
    const expLines = wrapText(doc, fraud.explanation, CW - 10);
    expLines.forEach(line => {
      doc.text(line, M.L + 5, y);
      y += 3.2;
    });
  }

  y += 6;

  // ── ANALYST VERDICT (Brutal Recommendation) ──
  ({ y, pageNum } = checkPage(doc, y, 50, pageNum));

  // Full-width dark box
  const recText = buildBrutalRec(result);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const recLines = wrapText(doc, recText, CW - 20);
  const recBoxH = 10 + recLines.length * 3.5 + 8;

  ({ y, pageNum } = checkPage(doc, y, recBoxH, pageNum));

  doc.setFillColor(...hex(C.INK));
  doc.rect(M.L, y, CW, recBoxH, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...hex(C.BLUE));
  doc.text('ANALYST VERDICT', M.L + 6, y + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...hex(C.WHITE));
  let ry = y + 14;
  recLines.forEach(line => {
    doc.text(line, M.L + 6, ry);
    ry += 3.5;
  });

  y += recBoxH + 4;

  // ── Collaboration suggestion ──
  ({ y, pageNum } = checkPage(doc, y, 16, pageNum));
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...hex(C.BODY));
  doc.text('Suggested format: ' + (a.recommendation.suggested_content_format || 'N/A'), M.L + 3, y);
  y += 5;
  doc.text('Estimated cost tier: ' + cost, M.L + 3, y);
  y += 5;
  if (a.recommendation.one_line_summary) {
    doc.setTextColor(...hex(C.CAPTION));
    const sumLines = wrapText(doc, a.recommendation.one_line_summary, CW - 6);
    sumLines.forEach(line => {
      doc.text(line, M.L + 3, y);
      y += 3.2;
    });
  }

  // Draw footer for the last page of this creator
  drawFooter(doc, pageNum);

  return pageNum;
}

// ═══════════════════════════════════════════════════════════════
//  COMPARISON TABLE
// ═══════════════════════════════════════════════════════════════

function drawComparison(doc, results) {
  pageStart(doc);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...hex(C.INK));
  doc.text('Shortlist Comparison', M.L, 22);
  thinRule(doc, 27);

  const cols = Math.min(results.length, 5);
  const nameColW = 52;
  const dataColW = (CW - nameColW) / cols;
  let y = 35;

  // Header row
  doc.setFillColor(...hex(C.INK));
  doc.rect(M.L, y, CW, 9, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...hex(C.WHITE));
  doc.text('METRIC', M.L + 3, y + 6);

  results.slice(0, cols).forEach((r, i) => {
    const x = M.L + nameColW + i * dataColW;
    doc.text(truncate(doc, r.channelName, dataColW - 4), x + dataColW / 2, y + 6, { align: 'center' });
  });
  y += 11;

  const followLabel = results.every(r => r.platform === 'instagram') ? 'Followers' :
                      results.some(r => r.platform === 'instagram') ? 'Follows / Subs' : 'Subscribers';

  const rows = [
    { label: 'Overall PCF', key: r => r.analysis?.pcf_score?.overall || 0, bold: true },
    { label: 'Reach Relevance', key: r => r.analysis?.pcf_score?.reach_relevance?.score || 0 },
    { label: 'Engagement Quality', key: r => r.analysis?.pcf_score?.engagement_quality?.score || 0 },
    { label: 'Parasocial Depth', key: r => r.analysis?.pcf_score?.parasocial_depth?.score || 0 },
    { label: 'Brand Fit', key: r => r.analysis?.pcf_score?.brand_fit?.score || 0 },
    { label: 'Growth Potential', key: r => (r.analysis?.pcf_score?.growth_potential?.score ?? 0) },
    { label: followLabel, key: r => formatSubscribers(r.subscriberCount), numeric: false },
    { label: 'Positive Sentiment', key: r => (r.analysis?.sentiment_breakdown?.positive_percent || 0) + '%', numeric: false },
    { label: 'Fraud Risk', key: r => (r.analysis?.fraud_signals?.risk_level || 'N/A').toUpperCase(), numeric: false },
    { label: 'Verdict', key: r => getScoreLabel(r.analysis?.pcf_score?.overall || 0), numeric: false },
    { label: 'Est. Cost', key: r => getCostLabel(r.analysis?.recommendation?.estimated_cost_tier), numeric: false },
    { label: 'Language', key: r => r.analysis?.content_classification?.language_mix || 'N/A', numeric: false },
  ];

  rows.forEach((row, ri) => {
    const rowY = y + ri * 11;
    if (ri % 2 === 0) {
      doc.setFillColor(...hex(C.PALE));
      doc.rect(M.L, rowY, CW, 11, 'F');
    }

    doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...hex(C.BODY));
    doc.text(row.label, M.L + 3, rowY + 7);

    const values = results.slice(0, cols).map(r => row.key(r));
    const numericVals = row.numeric !== false ? values.map(Number) : null;
    const maxVal = numericVals ? Math.max(...numericVals) : null;

    results.slice(0, cols).forEach((r, i) => {
      const x = M.L + nameColW + i * dataColW;
      const val = row.key(r);
      const isMax = maxVal !== null && Number(val) === maxVal && cols > 1 && ri < 6;

      doc.setFont('helvetica', row.bold || isMax ? 'bold' : 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...hex(isMax ? C.BLUE : C.BODY));
      doc.text(String(val), x + dataColW / 2, rowY + 7, { align: 'center' });
    });
  });
}

// ═══════════════════════════════════════════════════════════════
//  MAIN ENTRY — generateReport
// ═══════════════════════════════════════════════════════════════

export function generateReport(results, searchCriteria, dimWeights) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const date = new Date().toLocaleDateString('en-IN', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  // Platform label
  const hasYT = results.some(r => r.platform !== 'instagram');
  const hasIG = results.some(r => r.platform === 'instagram');
  const platLabel = hasYT && hasIG ? 'YouTube + Instagram' : hasIG ? 'Instagram' : 'YouTube';

  // ── Page 1: Cover ──
  drawCover(doc, searchCriteria, results.length, date, platLabel);

  // ── Page 2: Executive Summary ──
  doc.addPage();
  drawExecutiveSummary(doc, results, searchCriteria);
  drawFooter(doc, 2);

  // ── Creator Pages ──
  let pageNum = 2;
  results.forEach((result, i) => {
    pageNum = drawCreatorSection(doc, result, i + 1, pageNum, dimWeights);
  });

  // ── Comparison Table (if 2+ creators) ──
  if (results.length >= 2) {
    doc.addPage();
    pageNum++;
    drawComparison(doc, results);
    drawFooter(doc, pageNum);
  }

  // Save
  const slug = (searchCriteria?.category || 'scout').split('&')[0].trim().replace(/\s+/g, '-').toLowerCase();
  const dateSlug = date.replace(/\s+/g, '-').toLowerCase();
  doc.save(`muuchstac-${slug}-report-${dateSlug}.pdf`);
}
