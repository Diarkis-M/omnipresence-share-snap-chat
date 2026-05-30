/**
 * Resilience utilities — circuit breakers, retry, safe config loading.
 * Zero external dependencies. Used by extractor, discovery, and pipeline.
 */

import { readFileSync, existsSync } from 'fs';

/**
 * Fetch with retry and adaptive backoff.
 *
 * @param {string} url
 * @param {Object} [options] - fetch options
 * @param {Object} [retryOpts]
 * @param {number} [retryOpts.maxRetries=2] - max retry attempts
 * @param {number[]} [retryOpts.backoffMs=[2000,5000]] - delay per retry
 * @param {number} [retryOpts.timeoutMs=15000] - per-request timeout
 * @param {string} [retryOpts.userAgent] - User-Agent header
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, options = {}, retryOpts = {}) {
  const {
    maxRetries = 2,
    backoffMs = [2000, 5000],
    timeoutMs = 15000,
    userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  } = retryOpts;

  const headers = { 'User-Agent': userAgent, ...options.headers };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      // Respect Retry-After on 429
      if (resp.status === 429 && attempt < maxRetries) {
        const retryAfter = parseInt(resp.headers.get('Retry-After') || '5', 10);
        const delay = Math.min(retryAfter * 1000, 30000);
        await sleep(delay);
        continue;
      }

      return resp;
    } catch (err) {
      clearTimeout(timeout);
      if (attempt < maxRetries) {
        const delay = backoffMs[attempt] || backoffMs[backoffMs.length - 1];
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
}

/**
 * Circuit breaker — tracks consecutive failures per key (e.g., platform name).
 * Trips after `threshold` consecutive failures. Auto-resets on next pipeline run
 * (caller creates a new instance per run).
 */
export class CircuitBreaker {
  constructor(threshold = 5) {
    this.threshold = threshold;
    this._failures = new Map(); // key → consecutive failure count
    this._tripped = new Set();  // keys that have tripped
  }

  /** Record a successful request for this key. Resets failure count. */
  recordSuccess(key) {
    this._failures.set(key, 0);
  }

  /** Record a failed request. Returns true if circuit just tripped. */
  recordFailure(key) {
    const count = (this._failures.get(key) || 0) + 1;
    this._failures.set(key, count);
    if (count >= this.threshold && !this._tripped.has(key)) {
      this._tripped.add(key);
      return true; // just tripped
    }
    return false;
  }

  /** Check if circuit is tripped for this key. */
  isTripped(key) {
    return this._tripped.has(key);
  }

  /** Get all tripped circuits. */
  getTripped() {
    return [...this._tripped];
  }
}

/**
 * Load a JSON config file with validation and fallback.
 *
 * @param {string} filePath - absolute path to JSON file
 * @param {*} fallback - returned if file is missing or invalid JSON
 * @returns {*} parsed JSON or fallback
 */
export function loadConfigSafe(filePath, fallback) {
  try {
    if (!existsSync(filePath)) return fallback;
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.warn(`[resilience] Failed to load config ${filePath}: ${err.message}`);
    return fallback;
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
