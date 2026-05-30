'use client';

import { useState } from 'react';

const CATEGORIES = [
  'Beard Oil & Beard Care',
  'Face Wash & Face Care',
  'Hair Styling & Hair Care',
  "Men's Grooming (General)",
  'Skincare & Serums',
  'Deodorants & Perfumes',
  'Home Care & Air Fresheners',
];

const CONTENT_TYPES = [
  'Product Reviews',
  'Tutorials / How-to',
  'Hauls & Unboxing',
  'Day-in-my-life / Routine',
  'Comparison Videos',
  'UGC / Organic Mention',
];

const SUBSCRIBER_RANGES = [
  { value: 'nano', label: 'Nano (1K – 10K)' },
  { value: 'micro', label: 'Micro (10K – 100K)' },
  { value: 'mid', label: 'Mid (100K – 500K)' },
  { value: 'macro', label: 'Macro (500K+)' },
];

const VIDEO_FORMATS = [
  { value: 'mixed', label: 'All Formats' },
  { value: 'long', label: 'Long-form Only' },
  { value: 'short', label: 'Shorts Only' },
];

const LANGUAGES = [
  'English', 'Hindi', 'Tamil', 'Telugu', 'Kannada',
  'Bengali', 'Marathi', 'Gujarati', 'Malayalam',
  'Punjabi', 'Odia', 'Mixed / Hinglish',
];

const PLATFORMS = [
  { value: 'youtube', label: 'YouTube', icon: 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z' },
  { value: 'instagram', label: 'Instagram', icon: 'M7.75 2h8.5A5.75 5.75 0 0122 7.75v8.5A5.75 5.75 0 0116.25 22h-8.5A5.75 5.75 0 012 16.25v-8.5A5.75 5.75 0 017.75 2zm0 1.5A4.25 4.25 0 003.5 7.75v8.5A4.25 4.25 0 007.75 20.5h8.5a4.25 4.25 0 004.25-4.25v-8.5A4.25 4.25 0 0016.25 3.5h-8.5zM12 7a5 5 0 110 10 5 5 0 010-10zm0 1.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zm5.25-2a.75.75 0 110 1.5.75.75 0 010-1.5z' },
  { value: 'both', label: 'Both Platforms', icon: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9' },
];

const BRANDS = [
  { value: 'Muuchstac (men\'s grooming — beard, face, hair)', label: 'Muuchstac' },
  { value: 'Cinthol (men\'s grooming — soaps, deos)', label: 'Cinthol' },
  { value: 'KS99 / Godrej Perfumes (fragrances)', label: 'KS99 / Godrej Perfumes' },
  { value: 'Godrej Aer (home care — air fresheners)', label: 'Godrej Aer' },
];

export default function SearchForm({ onSubmit, isLoading }) {
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [contentTypes, setContentTypes] = useState([]);
  const [subscriberRange, setSubscriberRange] = useState('micro');
  const [videoFormat, setVideoFormat] = useState('mixed');
  const [languages, setLanguages] = useState(['English']);
  const [maxResults, setMaxResults] = useState(5);
  const [brandContext, setBrandContext] = useState(BRANDS[0].value);
  const [customBrand, setCustomBrand] = useState('');
  const [showCustomCategory, setShowCustomCategory] = useState(false);
  const [showCustomBrand, setShowCustomBrand] = useState(false);
  const [platform, setPlatform] = useState('youtube');
  const [langError, setLangError] = useState('');

  const toggleContentType = (type) => {
    setContentTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const toggleLanguage = (lang) => {
    setLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
    if (langError) setLangError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const finalCategory = showCustomCategory ? customCategory : category;
    const finalBrand = showCustomBrand ? customBrand : brandContext;
    if (!finalCategory) return;
    if (languages.length === 0) {
      setLangError('Select at least one content language');
      return;
    }
    setLangError('');
    onSubmit({
      category: finalCategory,
      contentTypes,
      subscriberRange,
      videoFormat,
      languages,
      maxResults,
      brandContext: finalBrand,
      platform,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Product Category */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Product Category <span className="text-danger">*</span>
        </label>
        {!showCustomCategory ? (
          <div className="space-y-2">
            <select
              value={category}
              onChange={(e) => {
                if (e.target.value === '__custom__') {
                  setShowCustomCategory(true);
                  setCategory('');
                } else {
                  setCategory(e.target.value);
                }
              }}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-700 focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
              required
            >
              <option value="">Select a category...</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
              <option value="__custom__">Custom (type your own)</option>
            </select>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              placeholder="Enter custom category..."
              className="flex-1 rounded-lg border border-gray-300 px-4 py-3 focus:border-accent focus:ring-2 focus:ring-accent/20"
              required
            />
            <button
              type="button"
              onClick={() => { setShowCustomCategory(false); setCustomCategory(''); }}
              className="px-4 py-3 text-sm text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg"
            >
              Back
            </button>
          </div>
        )}
      </div>

      {/* Platform Selection */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Platform
        </label>
        <div className="grid grid-cols-3 gap-2">
          {PLATFORMS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPlatform(p.value)}
              className={`flex items-center justify-center gap-2 px-3 py-3 rounded-lg border-2 transition-all text-sm font-medium ${
                platform === p.value
                  ? 'border-accent bg-accent/5 text-accent'
                  : 'border-gray-200 hover:border-gray-300 text-gray-500'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={p.icon} />
              </svg>
              {p.label}
            </button>
          ))}
        </div>
        {platform === 'instagram' && (
          <p className="text-[10px] text-godrej-sky mt-2">
            Instagram search uses hashtag discovery via Apify. Slower than YouTube (~1-2 min) but finds Reels creators.
          </p>
        )}
        {platform === 'both' && (
          <p className="text-[10px] text-godrej-sky mt-2">
            Runs YouTube and Instagram searches in parallel, then merges results.
          </p>
        )}
      </div>

      {/* Content Type — YouTube only */}
      {platform !== 'instagram' && <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Content Type <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CONTENT_TYPES.map((type) => (
            <label
              key={type}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition-all text-sm ${
                contentTypes.includes(type)
                  ? 'border-accent bg-accent/5 text-accent'
                  : 'border-gray-200 hover:border-gray-300 text-gray-600'
              }`}
            >
              <input
                type="checkbox"
                checked={contentTypes.includes(type)}
                onChange={() => toggleContentType(type)}
                className="sr-only"
              />
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                contentTypes.includes(type) ? 'border-accent bg-accent' : 'border-gray-300'
              }`}>
                {contentTypes.includes(type) && (
                  <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              {type}
            </label>
          ))}
        </div>
      </div>}

      {/* Subscriber/Follower Range, Video Format & Max Results */}
      <div className={`grid grid-cols-1 gap-6 ${platform === 'instagram' ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            {platform === 'instagram' ? 'Follower Range' : 'Subscriber Range'}
          </label>
          <select
            value={subscriberRange}
            onChange={(e) => setSubscriberRange(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-700 focus:border-accent focus:ring-2 focus:ring-accent/20"
          >
            {SUBSCRIBER_RANGES.map((range) => (
              <option key={range.value} value={range.value}>{range.label}</option>
            ))}
          </select>
        </div>
        {platform !== 'instagram' && <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Video Format
          </label>
          <select
            value={videoFormat}
            onChange={(e) => setVideoFormat(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-700 focus:border-accent focus:ring-2 focus:ring-accent/20"
          >
            {VIDEO_FORMATS.map((fmt) => (
              <option key={fmt.value} value={fmt.value}>{fmt.label}</option>
            ))}
          </select>
        </div>}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Number of Results
          </label>
          <select
            value={maxResults}
            onChange={(e) => setMaxResults(parseInt(e.target.value))}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-700 focus:border-accent focus:ring-2 focus:ring-accent/20"
          >
            {[5, 10, 15, 20, 30, 50].map((n) => (
              <option key={n} value={n}>{n} influencers</option>
            ))}
          </select>
          {platform === 'instagram' && maxResults > 15 && (
            <p className="text-[10px] text-amber-500 mt-1">
              Instagram results may be fewer due to hashtag pool size and fraud filtering.
            </p>
          )}
        </div>
      </div>

      {/* Content Language */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Content Language
        </label>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => toggleLanguage(lang)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                languages.includes(lang)
                  ? 'bg-accent text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {lang}
            </button>
          ))}
        </div>
        {langError && (
          <p className="text-xs text-danger mt-2 flex items-center gap-1">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {langError}
          </p>
        )}
      </div>

      {/* Brand Context */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Brand Context
        </label>
        {!showCustomBrand ? (
          <select
            value={brandContext}
            onChange={(e) => {
              if (e.target.value === '__custom__') {
                setShowCustomBrand(true);
                setBrandContext('');
              } else {
                setBrandContext(e.target.value);
              }
            }}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-700 focus:border-accent focus:ring-2 focus:ring-accent/20"
          >
            {BRANDS.map((brand) => (
              <option key={brand.value} value={brand.value}>{brand.label}</option>
            ))}
            <option value="__custom__">Custom brand</option>
          </select>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={customBrand}
              onChange={(e) => setCustomBrand(e.target.value)}
              placeholder="Enter brand name and context..."
              className="flex-1 rounded-lg border border-gray-300 px-4 py-3 focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
            <button
              type="button"
              onClick={() => { setShowCustomBrand(false); setCustomBrand(''); setBrandContext(BRANDS[0].value); }}
              className="px-4 py-3 text-sm text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg"
            >
              Back
            </button>
          </div>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isLoading || (!category && !customCategory)}
        className={`w-full py-4 px-6 rounded-xl text-white font-bold text-lg transition-all ${
          isLoading || (!category && !customCategory)
            ? 'bg-gray-300 cursor-not-allowed'
            : 'bg-accent hover:bg-accent-dark shadow-lg hover:shadow-xl active:scale-[0.98]'
        }`}
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-3">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Scouting in progress...
          </span>
        ) : (
          'Start Scouting'
        )}
      </button>
      <p className="text-[11px] text-gray-400 text-center mt-3">
        {platform === 'instagram'
          ? 'Hashtag Discovery → Profile Scrape → Comment Fetch → Claude AI Analysis → PCF Scoring'
          : platform === 'both'
          ? 'YouTube + Instagram Search → Comment Fetch → Claude AI Analysis → PCF Scoring'
          : 'YouTube Search → Comment Fetch → Claude AI Analysis → PCF Scoring'}
      </p>
    </form>
  );
}
