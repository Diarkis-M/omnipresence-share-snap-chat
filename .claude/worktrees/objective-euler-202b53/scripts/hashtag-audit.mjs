/**
 * Hashtag Audit Script
 * Runs 4 batched Apify hashtag searches, profiles top creators,
 * and reports which hashtags appear in Indian vs non-Indian handles.
 */

const APIFY_BASE = 'https://api.apify.com/v2';
const API_TOKEN = process.env.APIFY_API_TOKEN || 'apify_api_x0mHFQ34vFOeh1pTQmvwzFmgrQi7Sw3WKBBj';

async function runActor(actorId, input, timeout = 180) {
  const res = await fetch(
    `${APIFY_BASE}/acts/${actorId}/runs?waitForFinish=${timeout}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_TOKEN}` },
      body: JSON.stringify(input),
    }
  );
  const data = await res.json();
  if (data.data?.status !== 'SUCCEEDED') {
    console.log(`  ⚠ Actor ${actorId} status: ${data.data?.status} — ${data.data?.statusMessage || ''}`);
    return [];
  }
  const dsRes = await fetch(
    `${APIFY_BASE}/datasets/${data.data.defaultDatasetId}/items?limit=500`,
    { headers: { Authorization: `Bearer ${API_TOKEN}` } }
  );
  return dsRes.json();
}

// ── BATCH DEFINITIONS ──
const BATCHES = [
  {
    name: 'Beard & Moustache',
    hashtags: ['beard', 'beardoil', 'beardcare', 'beardlife', 'beardlove', 'beardporn', 'moustache', 'stachewax', 'beardedman', 'beardstyle'],
  },
  {
    name: 'Barber & Hair',
    hashtags: ['barbershop', 'barber', 'barberlife', 'haircut', 'pomade', 'fade', 'menshair', 'barberlove', 'menshaircut', 'barbershopconnect'],
  },
  {
    name: 'Grooming & Skincare',
    hashtags: ['mensgrooming', 'malegrooming', 'mencare', 'menskincare', 'wetshaving', 'shaving', 'mensgroomingproducts', 'mensgroomingtips', 'grooming', 'mensstyle'],
  },
  {
    name: 'Niche & Suspect',
    hashtags: ['elvicto', 'perawatanpria', 'komedo', 'skincarepria', 'serumpria', 'priamasakini', 'blackmask', 'malewaxing', 'oxfordcut', 'skinfade'],
  },
];

// India detection
const FOREIGN_COUNTRIES = /\b(nigeria|usa|united states|uk|united kingdom|canada|australia|pakistan|bangladesh|dubai|uae|saudi|brazil|germany|france|italy|spain|south africa|kenya|ghana|indonesia|malaysia|japan|korea|china|philippines|turkey|egypt|mexico|colombia|argentina|thailand|vietnam|qatar|bahrain|oman|kuwait|netherlands|sweden|norway|denmark)\b/i;
const FOREIGN_CITIES = /\b(lagos|new york|london|los angeles|toronto|sydney|melbourne|karachi|lahore|dhaka|dubai|riyadh|nairobi|accra|jakarta|kuala lumpur|beijing|shanghai|tokyo|seoul|manila|cairo|berlin|paris|rome|madrid|cape town|sao paulo|bangkok|ho chi minh|amsterdam|stockholm|moscow|warsaw|doha|abu dhabi|singapore|san francisco|chicago|houston|dallas|miami|seattle|boston|atlanta)\b/i;
const INDIA_SIGNALS = /\b(india|bharat|mumbai|delhi|bangalore|bengaluru|hyderabad|chennai|kolkata|pune|jaipur|lucknow|ahmedabad|surat|noida|gurgaon|gurugram|kochi|coimbatore|goa|chandigarh|indore|bhopal|patna|ranchi|kerala|tamil nadu|maharashtra|karnataka|gujarat|rajasthan|punjab|haryana|hindi|desi|bhai|yaar)\b/i;
const INDONESIAN_SIGNALS = /\b(indonesia|jakarta|bandung|surabaya|bali|yogyakarta|pria|wanita|kecantikan|perawatan)\b/i;

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     HASHTAG AUDIT — Indian Men\'s Grooming Pipeline     ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ── Phase 1: Run all hashtag batches ──
  const allPosts = []; // { post, batchName }
  const hashtagPostCount = new Map(); // hashtag → total post count

  for (const batch of BATCHES) {
    console.log(`\n🔍 Batch: "${batch.name}" — hashtags: ${batch.hashtags.join(', ')}`);
    const posts = await runActor('apify~instagram-hashtag-scraper', {
      hashtags: batch.hashtags,
      resultsLimit: 120,
    });
    console.log(`  → ${posts.length} posts found`);

    for (const post of posts) {
      allPosts.push({ post, batchName: batch.name });
      for (const h of (post.hashtags || [])) {
        const lh = h.toLowerCase();
        hashtagPostCount.set(lh, (hashtagPostCount.get(lh) || 0) + 1);
      }
    }
  }

  console.log(`\n════ TOTAL: ${allPosts.length} posts across all batches ════\n`);

  // ── Phase 2: Extract unique creators sorted by engagement ──
  const creatorMap = new Map(); // username → { bestPost, totalEng, hashtags: Set }
  for (const { post } of allPosts) {
    const u = post.ownerUsername;
    if (!u) continue;
    const eng = (post.likesCount || 0) + (post.commentsCount || 0);
    const existing = creatorMap.get(u);
    if (!existing) {
      creatorMap.set(u, {
        bestPost: post,
        totalEng: eng,
        hashtags: new Set((post.hashtags || []).map(h => h.toLowerCase())),
      });
    } else {
      if (eng > existing.totalEng) {
        existing.bestPost = post;
        existing.totalEng = eng;
      }
      for (const h of (post.hashtags || [])) existing.hashtags.add(h.toLowerCase());
    }
  }

  const sortedCreators = [...creatorMap.entries()]
    .sort((a, b) => b[1].totalEng - a[1].totalEng)
    .map(([u, d]) => ({ username: u, ...d }));

  console.log(`Unique creators: ${sortedCreators.length}`);
  console.log(`Top 10 by engagement:`);
  for (const c of sortedCreators.slice(0, 10)) {
    console.log(`  @${c.username} — eng:${c.totalEng} — tags: ${[...c.hashtags].slice(0, 5).join(', ')}`);
  }

  // ── Phase 3: Profile scraping for top 70 creators ──
  const toScrape = sortedCreators.slice(0, 70).map(c => c.username);
  console.log(`\n🔍 Scraping ${toScrape.length} profiles...`);
  const profiles = await runActor('apify~instagram-profile-scraper', { usernames: toScrape }, 240);
  console.log(`  → ${profiles.length} profiles returned`);

  const profileMap = new Map();
  for (const p of profiles) {
    if (p.username) profileMap.set(p.username, p);
  }

  // ── Phase 4: Classify each creator ──
  const tiers = { nano: [], micro: [], mid: [], macro: [] };
  const indianCreators = [];
  const nonIndianCreators = [];
  const hashtagByIndian = new Map(); // hashtag → { indian: count, nonIndian: count }

  for (const creator of sortedCreators) {
    const profile = profileMap.get(creator.username);
    if (!profile) continue;

    const followers = profile.followersCount || 0;
    const bio = (profile.biography || '').toLowerCase();
    const loc = (creator.bestPost.locationName || '').toLowerCase();
    const combined = bio + ' ' + loc;

    // Determine tier
    let tier = null;
    if (followers >= 500000) tier = 'macro';
    else if (followers >= 100000) tier = 'mid';
    else if (followers >= 10000) tier = 'micro';
    else if (followers >= 1000) tier = 'nano';

    // Determine if Indian
    let isIndian = false;
    let country = 'unknown';

    if (INDIA_SIGNALS.test(combined)) {
      isIndian = true;
      country = 'india';
    } else if (FOREIGN_COUNTRIES.test(combined) || FOREIGN_CITIES.test(combined)) {
      isIndian = false;
      country = 'foreign';
    } else if (INDONESIAN_SIGNALS.test(combined) || [...creator.hashtags].some(h => /pria|komedo|perawatan/i.test(h))) {
      isIndian = false;
      country = 'indonesia';
    } else {
      // No clear signal — ambiguous
      country = 'ambiguous';
    }

    const entry = {
      username: creator.username,
      followers,
      tier,
      country,
      bio: bio.slice(0, 100),
      hashtags: [...creator.hashtags],
    };

    if (tier) tiers[tier].push(entry);

    if (isIndian || country === 'ambiguous') {
      indianCreators.push(entry);
    } else {
      nonIndianCreators.push(entry);
    }

    // Track hashtag usage by country
    for (const h of creator.hashtags) {
      if (!hashtagByIndian.has(h)) hashtagByIndian.set(h, { indian: 0, nonIndian: 0, ambiguous: 0 });
      const rec = hashtagByIndian.get(h);
      if (isIndian) rec.indian++;
      else if (country === 'ambiguous') rec.ambiguous++;
      else rec.nonIndian++;
    }
  }

  // ── Phase 5: REPORT ──
  console.log('\n╔═══════════════════════════════════════════╗');
  console.log('║           TIER DISTRIBUTION               ║');
  console.log('╚═══════════════════════════════════════════╝');
  for (const [tier, list] of Object.entries(tiers)) {
    const indian = list.filter(c => c.country === 'india').length;
    const amb = list.filter(c => c.country === 'ambiguous').length;
    console.log(`  ${tier.toUpperCase()}: ${list.length} total — ${indian} Indian, ${amb} ambiguous, ${list.length - indian - amb} foreign`);
    for (const c of list.filter(e => e.country === 'india').slice(0, 5)) {
      console.log(`    🇮🇳 @${c.username} — ${c.followers.toLocaleString()} — ${c.bio.slice(0, 60)}`);
    }
  }

  console.log('\n╔═══════════════════════════════════════════╗');
  console.log('║   HASHTAGS THAT DO NOT APPEAR IN INDIAN   ║');
  console.log('║   HANDLES (from user\'s provided list)      ║');
  console.log('╚═══════════════════════════════════════════╝');

  // All hashtags from user's lists
  const userHashtags = [
    'mensgroomingproducts', 'mensgrooming', 'beard', 'beardoil', 'barbershop', 'barber',
    'shaving', 'grooming', 'elvicto', 'beardlife', 'beards', 'mensgroomingtips', 'pomade',
    'beardcare', 'beardlove', 'blackmask', 'komedo', 'beardstyle', 'mensstyle', 'mencare',
    'perawatanpria', 'beardedman', 'priamasakini', 'stachewax', 'haircuts', 'skincarepria',
    'beardporn', 'barbers', 'moustache', 'serumpria',
    'barberlife', 'menshair', 'mensfashion', 'haircut', 'barbershopconnect', 'wetshaving',
    'fade', 'menstyle', 'shaveoftheday', 'hair', 'barbering', 'beardgang', 'menshaircut',
    'shave', 'barberlove', 'traditionalshaving', 'shavelikeaman', 'sotd', 'hairstyle',
    'mengrooming', 'branch', 'mensalon', 'mengroomingproducts', 'haircare', 'men',
    'malegrooming', 'groomingday', 'salon', 'menhair', 'beardgrooming', 'menssalon',
    'menfashion', 'menhairstyle', 'menskincare', 'beauty', 'oxfordcut', 'balmain',
    'skinfade', 'skincare', 'wahl', 'waxing', 'malewaxing', 'andis', 'beardedmen',
  ];

  const unique = [...new Set(userHashtags.map(h => h.toLowerCase()))];

  const indianHashtags = [];
  const deadHashtags = []; // zero posts at all
  const foreignOnlyHashtags = []; // posts exist but zero Indian creators use them

  for (const h of unique) {
    const rec = hashtagByIndian.get(h);
    const totalPosts = hashtagPostCount.get(h) || 0;

    if (!rec && totalPosts === 0) {
      deadHashtags.push({ tag: h, reason: 'Zero posts found in any search' });
    } else if (!rec || (rec.indian === 0 && rec.ambiguous === 0)) {
      foreignOnlyHashtags.push({
        tag: h,
        totalPosts,
        nonIndian: rec?.nonIndian || 0,
        reason: 'Posts exist but NO Indian creators use this tag',
      });
    } else {
      indianHashtags.push({ tag: h, indian: rec.indian, ambiguous: rec.ambiguous, nonIndian: rec.nonIndian });
    }
  }

  console.log('\n❌ DEAD HASHTAGS (zero posts found):');
  for (const d of deadHashtags) {
    console.log(`  #${d.tag} — ${d.reason}`);
  }

  console.log('\n🚫 FOREIGN-ONLY HASHTAGS (posts exist but NO Indian handles):');
  for (const f of foreignOnlyHashtags.sort((a, b) => b.totalPosts - a.totalPosts)) {
    console.log(`  #${f.tag} — ${f.totalPosts} posts, ${f.nonIndian} non-Indian creators — ${f.reason}`);
  }

  console.log('\n✅ HASHTAGS USED BY INDIAN CREATORS (sorted by Indian count):');
  for (const i of indianHashtags.sort((a, b) => b.indian - a.indian)) {
    console.log(`  #${i.tag} — 🇮🇳 ${i.indian} Indian, 🌐 ${i.nonIndian} foreign, ❓ ${i.ambiguous} ambiguous`);
  }

  // Summary counts
  console.log(`\n════ SUMMARY ════`);
  console.log(`Total unique hashtags tested: ${unique.length}`);
  console.log(`✅ Used by Indian creators: ${indianHashtags.length}`);
  console.log(`🚫 Foreign-only (NO Indian use): ${foreignOnlyHashtags.length}`);
  console.log(`❌ Dead (zero posts): ${deadHashtags.length}`);
  console.log(`\nIndian creators found: ${indianCreators.length}`);
  console.log(`Non-Indian creators found: ${nonIndianCreators.length}`);
}

main().catch(e => console.error('Fatal:', e.message));
