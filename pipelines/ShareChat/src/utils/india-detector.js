/**
 * India geo-detection and brand page detection.
 * Standalone — no external pipeline dependencies.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

let _indiaSignals = null;
function getIndiaSignals() {
  if (_indiaSignals) return _indiaSignals;
  const raw = readFileSync(join(__dirname, '../../config/india-signals.json'), 'utf-8');
  const data = JSON.parse(raw);
  _indiaSignals = {
    cities: new Set(data.cities.map(c => c.toLowerCase())),
    regions: new Set(data.regions.map(r => r.toLowerCase())),
    keywords: new Set(data.keywords.map(k => k.toLowerCase())),
  };
  return _indiaSignals;
}

const FOREIGN_COUNTRIES = /\b(nigeria|usa|united states|uk|united kingdom|canada|australia|pakistan|bangladesh|dubai|uae|saudi|brazil|germany|france|italy|spain|south africa|kenya|ghana|indonesia|malaysia|japan|korea|china|philippines|turkey|egypt|mexico|colombia|argentina|thailand|vietnam|qatar|bahrain|oman|kuwait|new zealand|ireland|scotland|sweden|norway|denmark|netherlands|poland|russia|ukraine)\b/i;

const FOREIGN_CITIES = /\b(lagos|new york|london|los angeles|toronto|sydney|melbourne|karachi|lahore|dhaka|dubai|riyadh|nairobi|accra|jakarta|kuala lumpur|beijing|shanghai|tokyo|seoul|manila|cairo|berlin|paris|rome|madrid|cape town|sao paulo|bangkok|ho chi minh|amsterdam|stockholm|moscow|warsaw|doha|abu dhabi|singapore city|san francisco|chicago|houston|dallas|miami|seattle|boston|atlanta)\b/i;

/**
 * Check if a creator is CLEARLY non-Indian.
 * Inverted logic: only REJECT when foreign signals are obvious.
 * Most Indian creators don't write "India" in their bio.
 *
 * @param {string} bio - Creator bio text
 * @param {string} [country] - Country field (from API or other source)
 * @returns {boolean} true = likely NOT Indian, should reject
 */
export function isLikelyNonIndian(bio, country) {
  if (country) {
    const c = country.toLowerCase().trim();
    if (c === 'in' || c === 'india') return false;
    if (FOREIGN_COUNTRIES.test(c)) return true;
  }

  const text = (bio || '').toLowerCase();
  if (!text) return false;

  if (FOREIGN_COUNTRIES.test(text)) return true;
  if (FOREIGN_CITIES.test(text)) return true;

  return false;
}

/**
 * Check for positive India signals in text.
 * Returns { hasSignal: boolean, signals: string[] }
 */
export function detectIndiaSignals(bio, country, primaryLanguage) {
  const signals = [];

  if (country) {
    const c = country.toLowerCase().trim();
    if (c === 'in' || c === 'india') signals.push('country:india');
  }

  const indiaLangs = new Set([
    'hindi', 'tamil', 'telugu', 'kannada', 'bengali',
    'marathi', 'gujarati', 'malayalam', 'punjabi', 'odia', 'hinglish',
  ]);
  if (primaryLanguage && indiaLangs.has(primaryLanguage.toLowerCase())) {
    signals.push(`language:${primaryLanguage}`);
  }

  if (bio) {
    const text = bio.toLowerCase();
    const { cities, regions, keywords } = getIndiaSignals();

    for (const city of cities) {
      if (text.includes(city)) { signals.push(`city:${city}`); break; }
    }
    for (const region of regions) {
      if (text.includes(region)) { signals.push(`region:${region}`); break; }
    }
    for (const kw of keywords) {
      if (text.includes(kw)) { signals.push(`keyword:${kw}`); break; }
    }
  }

  return { hasSignal: signals.length > 0, signals };
}

/**
 * Detect brand/company pages that are NOT individual influencers.
 * Bio keywords only — ShareChat doesn't reliably expose following/follower ratios
 * on all profile pages, so we check only text signals.
 *
 * @param {string} bio - Creator bio text
 * @returns {boolean} true = likely a brand page
 */
export function isLikelyBrandPage(bio) {
  const text = (bio || '').toLowerCase();
  if (!text) return false;

  const brandKeywords = /\b(official|brand|company|shop now|order now|worldwide|™|®|shipping|enquir|wholesale|manufacturer|store|outlet|est\.|since \d{4}|founded)\b/i;
  return brandKeywords.test(text);
}
