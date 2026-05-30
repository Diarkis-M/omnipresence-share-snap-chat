/**
 * Health monitoring for the scraping pipeline.
 *
 * Tracks:
 * - Extraction tier usage per run (% Tier 1/2/3/4)
 * - Canary profile test results
 * - Discovery query yield
 * - Gate/scoring distributions
 * - Run history for 30-day trending
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { loadConfigSafe } from './resilience.js';

export class HealthMonitor {
  constructor(configDir, dataDir, outputDir) {
    this.configDir = configDir;
    this.dataDir = dataDir;
    this.outputDir = outputDir;
    this.startTime = Date.now();

    // Per-run metrics
    this.metrics = {
      runStartedAt: new Date().toISOString(),
      duration: 0,
      tierUsage: { 1: 0, 2: 0, 3: 0, 4: 0, failed: 0 },
      totalEnriched: 0,
      canaryResults: [],
      queryYields: [],
      gateRejections: {},
      scoreDistribution: { excellent: 0, strong: 0, moderate: 0, weak: 0, poor: 0 },
      circuitBreakers: [],
      modelInfo: null,
      warnings: [],
      llmCost: 0,
    };
  }

  /** Record an extraction result. */
  recordExtraction(result) {
    this.metrics.totalEnriched++;
    const tier = result.extractionTier || 0;
    if (tier >= 1 && tier <= 4) {
      this.metrics.tierUsage[tier]++;
    } else {
      this.metrics.tierUsage.failed++;
    }
  }

  /** Record a query's yield. */
  recordQueryYield(query, handlesFound, source) {
    this.metrics.queryYields.push({ query, handlesFound, source });
  }

  /** Record a gate rejection. */
  recordGateRejection(gate) {
    this.metrics.gateRejections[gate] = (this.metrics.gateRejections[gate] || 0) + 1;
  }

  /** Record a score. */
  recordScore(score) {
    if (score >= 80) this.metrics.scoreDistribution.excellent++;
    else if (score >= 65) this.metrics.scoreDistribution.strong++;
    else if (score >= 50) this.metrics.scoreDistribution.moderate++;
    else if (score >= 35) this.metrics.scoreDistribution.weak++;
    else this.metrics.scoreDistribution.poor++;
  }

  /** Record a circuit breaker trip. */
  recordCircuitTrip(platform, error) {
    this.metrics.circuitBreakers.push({ platform, error, at: new Date().toISOString() });
    this.metrics.warnings.push(`Circuit breaker tripped for ${platform}: ${error}`);
  }

  /** Record model info. */
  recordModelInfo(info) {
    this.metrics.modelInfo = info;
    if (info.fallbackTriggered) {
      this.metrics.warnings.push(`Model fallback triggered: using ${info.model}`);
    }
  }

  /** Add a warning. */
  warn(message) {
    this.metrics.warnings.push(message);
  }

  /** Run canary tests. Results are added to metrics. */
  async runCanaryTests(extractFn) {
    const canaryConfig = loadConfigSafe(
      join(this.configDir, 'canary-profiles.json'),
      { canaries: [] }
    );

    for (const canary of canaryConfig.canaries) {
      try {
        const result = await extractFn(canary.handle, canary.platform);
        const checks = [];
        let passed = true;

        for (const [field, range] of Object.entries(canary.expected)) {
          const value = result.data?.[field];
          const inRange = value !== null && value >= range.min && value <= range.max;
          checks.push({ field, value, expected: range, passed: inRange });
          if (!inRange) passed = false;
        }

        this.metrics.canaryResults.push({
          handle: canary.handle,
          platform: canary.platform,
          passed,
          checks,
          extractionTier: result.extractionTier,
        });

        if (!passed) {
          this.metrics.warnings.push(`Canary FAILED: @${canary.handle} — extraction may be broken`);
        }
      } catch (err) {
        this.metrics.canaryResults.push({
          handle: canary.handle, platform: canary.platform,
          passed: false, error: err.message, checks: [],
        });
        this.metrics.warnings.push(`Canary ERROR: @${canary.handle} — ${err.message}`);
      }
    }
  }

  /** Finalize metrics and save health report. */
  finalize() {
    this.metrics.duration = ((Date.now() - this.startTime) / 1000).toFixed(1);

    // Calculate tier percentages
    const total = this.metrics.totalEnriched || 1;
    this.metrics.tierPercentages = {
      tier1: Math.round((this.metrics.tierUsage[1] / total) * 100),
      tier2: Math.round((this.metrics.tierUsage[2] / total) * 100),
      tier3: Math.round((this.metrics.tierUsage[3] / total) * 100),
      tier4: Math.round((this.metrics.tierUsage[4] / total) * 100),
      failed: Math.round((this.metrics.tierUsage.failed / total) * 100),
    };

    // Check tier health
    if (this.metrics.tierPercentages.tier1 < 60 && total > 3) {
      this.metrics.warnings.push(
        `Tier 1 (standards-based) success rate is ${this.metrics.tierPercentages.tier1}% — below 60% threshold. Platform may have changed.`
      );
    }

    // Save health report
    const reportPath = join(this.outputDir, 'health_report.json');
    writeFileSync(reportPath, JSON.stringify(this.metrics, null, 2));

    // Append to run history (for 30-day trending)
    this.appendRunHistory();

    return this.metrics;
  }

  /** Append this run's tier stats to run history for trending. */
  appendRunHistory() {
    const historyPath = join(this.dataDir, 'run_history.json');
    let history = [];
    try {
      if (existsSync(historyPath)) {
        history = JSON.parse(readFileSync(historyPath, 'utf-8'));
      }
    } catch { history = []; }

    history.push({
      date: this.metrics.runStartedAt,
      tierPercentages: this.metrics.tierPercentages,
      totalEnriched: this.metrics.totalEnriched,
      warnings: this.metrics.warnings.length,
      canariesPassed: this.metrics.canaryResults.filter(c => c.passed).length,
      canariesTotal: this.metrics.canaryResults.length,
    });

    // Keep last 90 entries (roughly 90 runs)
    if (history.length > 90) history = history.slice(-90);

    writeFileSync(historyPath, JSON.stringify(history, null, 2));
  }
}
