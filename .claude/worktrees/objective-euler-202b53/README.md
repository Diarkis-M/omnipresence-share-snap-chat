# Muuchstac Scout

**AI-Powered Influencer Discovery for GCPL Brands**

Built for the Godrej Consumer Products Limited (GCPL) Gurukul 2026 Summer Internship.

Muuchstac Scout finds, analyzes, and scores YouTube influencers using the **Parasocial Capital Framework (PCF)** — a 5-dimension scoring model that prioritizes genuine audience connection over vanity metrics.

---

## How It Works

1. **Search** — Define your criteria: product category, subscriber range, content type, target languages, and GCPL brand.
2. **Discover** — The app fires native-language YouTube queries and retrieves channel stats, video data, and comments via the YouTube Data API v3.
3. **Analyze** — Claude AI reads every comment corpus and scores each influencer on 5 PCF dimensions, flags fraud signals, and classifies sentiment.
4. **Rank** — Results are sorted by overall PCF score and displayed in an interactive, filterable dashboard with language grouping and CSV export.

---

## Parasocial Capital Framework (PCF)

| Dimension | Weight | What It Measures |
|---|---|---|
| **Reach Relevance** | 15% | Subscriber count relative to niche; view-to-sub ratio. Penalizes dead audiences. |
| **Engagement Quality** | 20% | Like/comment ratios — but more importantly, whether comments are substantive or generic "nice video bro". |
| **Parasocial Depth** | 30% | The emotional bond between creator and audience. Signals: personal stories, repeat commenters, purchase confessions, community language. **Highest weight — this is the core thesis.** |
| **Brand Fit** | 20% | Content/audience/values alignment with the specified GCPL brand. |
| **Bharat Applicability** | 15% | Reach beyond metro/English audiences into Tier 2/3 India. Vernacular language, regional relevance. |

Scoring bands: **Strong Fit** (80+) · **Moderate Fit** (60–79) · **Weak Fit** (40–59) · **Not Recommended** (<40)

---

## 4-Phase Language Detection Pipeline

Scout identifies audience language from Romanized (transliterated) comments across **10 Indian languages + English + Hinglish**:

```
DA  (Diagnostic Anchors ×4)  →  Copulas, postpositions, pronouns, negation
EV  (Exclusive Vocabulary ×3) →  High-frequency words exclusive to one language
MP  (Morphophonological ×2)   →  Suffix/affix patterns with negative lookaheads
CS  (Confirmed Shared ×1)     →  Cross-language words disambiguated by context
```

Languages supported: Hindi, Tamil, Telugu, Kannada, Bengali, Marathi, Gujarati, Malayalam, Punjabi, Odia, English, Hinglish.

Corpus-level classification with confidence tiers: `high` · `moderate` · `low` · `low_sample` · `null`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Styling | Tailwind CSS with Godrej brand palette |
| AI Analysis | Anthropic Claude API (claude-sonnet-4-20250514) |
| Data Source | YouTube Data API v3 |
| Language | JavaScript (React 18) |
| Deployment | Runs locally via `npm run dev` |

---

## Getting Started

### Prerequisites

- **Node.js** 18+ and npm
- A **YouTube Data API v3** key ([get one here](https://console.cloud.google.com/apis/credentials))
- An **Anthropic Claude API** key ([get one here](https://console.anthropic.com/settings/keys))

### Setup

```bash
# 1. Clone the repo
git clone <your-repo-url>
cd muuchstac-scout

# 2. Install dependencies
npm install

# 3. Create your environment file
cp .env.example .env.local

# 4. Add your API keys to .env.local
#    YOUTUBE_API_KEY=your_key
#    CLAUDE_API_KEY=sk-ant-your_key

# 5. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the app.

> **Note:** `.env.local` is gitignored. Never commit your API keys.

---

## Project Structure

```
muuchstac-scout/
├── src/
│   ├── app/
│   │   ├── page.js                 # Home — search form + hero
│   │   ├── results/page.js         # Results dashboard — cards, filters, export
│   │   ├── about/page.js           # Methodology / PCF explanation
│   │   ├── layout.js               # Root layout — nav, footer, Godrej branding
│   │   └── api/
│   │       ├── youtube/search/route.js   # YouTube search + channel enrichment
│   │       └── analyze/route.js          # Claude AI analysis endpoint
│   ├── components/
│   │   ├── SearchForm.js            # Multi-field search form
│   │   ├── InfluencerCard.js        # Result card with PCF breakdown
│   │   ├── LoadingState.js          # Animated progress during analysis
│   │   ├── ScoreBar.js              # Visual score bars
│   │   ├── SentimentChart.js        # Sentiment breakdown display
│   │   ├── ExportButton.js          # CSV export
│   │   └── ErrorBoundary.js         # Crash isolation for cards
│   ├── lib/
│   │   ├── youtube.js               # YouTube API client + 8-phase pipeline
│   │   ├── anthropic.js             # Claude prompt + PCF system instructions
│   │   └── scoring.js               # Score formatting + color mapping
│   └── utils/
│       └── languageDetection/
│           ├── index.js              # Public API — detectAudienceLanguage()
│           ├── languageMarkers.js    # DA, EV, MP, CS data structures
│           ├── commentScorer.js      # Per-comment 4-phase scoring
│           ├── corpusAggregator.js   # Corpus-level statistics
│           └── languageClassifier.js # Classification + confidence tiers
├── .env.example                     # Template for API keys
├── tailwind.config.js
└── package.json
```

---

## Key Features

- **Multi-language YouTube search** — queries in native scripts (Hindi, Tamil, Telugu, etc.) for better regional discovery
- **Language-grouped results** — influencers organized by detected audience language
- **Shorts vs. long-form analysis** — separate comment analysis for YouTube Shorts
- **Fraud detection** — flags bot-like comments, engagement anomalies, planted reviews
- **Sentiment breakdown** — positive/negative/neutral percentages with theme extraction
- **Parasocial indicators** — repeat commenters, personal storytelling, purchase intent
- **CSV export** — download results for offline analysis
- **Error boundaries** — one broken card won't crash the results page
- **Persistent results** — refresh the page without losing your analysis (localStorage)
- **Cancel mid-analysis** — stop the AI pipeline at any point and keep partial results

---

## API Routes

### `POST /api/youtube/search`

Searches YouTube, enriches channels with stats and comments, runs language detection.

**Body:**
```json
{
  "category": "Beard Oil & Beard Care",
  "subscriberRange": "micro",
  "contentTypes": ["Product Reviews"],
  "languages": ["Hindi", "English"],
  "videoFormat": "mixed",
  "maxResults": 5,
  "brandContext": "Muuchstac (men's grooming)"
}
```

### `POST /api/analyze`

Sends influencer data to Claude for PCF scoring.

**Body:**
```json
{
  "influencer": { "channelName": "...", "comments": [...], ... },
  "brandContext": "Muuchstac (men's grooming)"
}
```

---

## GCPL Brands Supported

| Brand | Category |
|---|---|
| **Muuchstac** | Men's grooming — beard, face, hair |
| **Cinthol** | Men's grooming — soaps, deos |
| **KS99 / Godrej Perfumes** | Fragrances |
| **Godrej Aer** | Home care — air fresheners |

---

## Attribution

Built by **Shashwat** (XLRI Jamshedpur) as part of the GCPL Gurukul 2026 Summer Internship Program.

**Powered by:**
- [Anthropic Claude API](https://www.anthropic.com/) — AI analysis engine
- [YouTube Data API v3](https://developers.google.com/youtube/v3) — Video and channel data
- [Next.js](https://nextjs.org/) — React framework
- [Tailwind CSS](https://tailwindcss.com/) — Styling

---

## License

Internal project — GCPL Gurukul 2026.
