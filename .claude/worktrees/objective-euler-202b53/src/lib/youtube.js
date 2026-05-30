import { detectCommentLanguagesV2, getDetectionDetails } from '@/utils/languageDetection';
import { runAllGates } from './robustnessGates';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

// ── Category-specific keywords for relevance filtering ──
// Videos must match at least one keyword (case-insensitive) in title/description
// to pass the relevance filter. This prevents news channels, politics, etc.
const CATEGORY_RELEVANCE_KEYWORDS = {
  'Beard Oil & Beard Care': [
    'beard', 'dadi', 'dadhi', 'daadhee', 'daadhi', 'grooming', 'shave', 'shaving',
    'trimmer', 'oil', 'balm', 'wax', 'facial hair', 'moustache', 'mustache',
    'men', 'review', 'skincare', 'care', 'routine',
    'గడ్డం', 'தாடி', 'दाढ़ी', 'ಗಡ್ಡ', 'দাড়ি', 'दाढी', 'દાઢી', 'താടി',
  ],
  'Face Wash & Face Care': [
    'face wash', 'facewash', 'cleanser', 'skin', 'skincare', 'skin care', 'pimple',
    'acne', 'glow', 'dark spot', 'sunscreen', 'moisturizer', 'face', 'men',
    'review', 'routine', 'oily', 'dry skin', 'fairness', 'brightening',
    'चेहरा', 'त्वचा', 'ముఖం', 'சரும', 'ಚರ್ಮ', 'মুখ', 'ત્વચા',
  ],
  'Hair Styling & Hair Care': [
    'hair', 'hairstyle', 'hair style', 'hair wax', 'hair clay', 'pomade', 'gel',
    'hair fall', 'hairfall', 'dandruff', 'shampoo', 'conditioner', 'hair care',
    'men', 'styling', 'review', 'routine', 'बाल', 'केस',
    'జుట్టు', 'முடி', 'ಕೂದಲ', 'চুল', 'વાળ', 'മുടി',
  ],
  "Men's Grooming (General)": [
    'grooming', 'groom', 'skincare', 'skin care', 'beard', 'hair', 'face',
    'men', 'routine', 'review', 'product', 'trimmer', 'shave', 'cologne',
    'deodorant', 'perfume', 'style', 'look', 'handsome', 'transformation',
    'ग्रूमिंग', 'గ్రూమింగ్', 'க்ரூமிங்', 'ಗ್ರೂಮಿಂಗ್', 'গ্রুমিং',
  ],
  'Skincare & Serums': [
    'serum', 'skincare', 'skin care', 'vitamin c', 'niacinamide', 'retinol',
    'moisturizer', 'sunscreen', 'face', 'glow', 'dark spot', 'pigmentation',
    'men', 'review', 'routine', 'pimple', 'acne', 'anti-aging',
    'सीरम', 'స్కిన్', 'சீரம்', 'ಸೀರಮ್', 'সিরাম',
  ],
  'Deodorants & Perfumes': [
    'perfume', 'deodorant', 'deo', 'fragrance', 'cologne', 'scent', 'smell',
    'body spray', 'attar', 'oud', 'long lasting', 'men', 'review',
    'collection', 'affordable', 'best', 'top',
    'परफ्यूम', 'పెర్ఫ్యూమ్', 'வாசனை', 'ಪರ್ಫ್ಯೂಮ್', 'পারফিউম',
  ],
  'Home Care & Air Fresheners': [
    'air freshener', 'room freshener', 'home', 'fragrance', 'aer', 'godrej',
    'car freshener', 'diffuser', 'scent', 'incense', 'review', 'home care',
    'cleaning', 'fresh', 'smell',
    'एयर फ्रेशनर', 'ఎయిర్ ఫ్రెషనర్', 'ஏர் ஃப்ரெஷ்னர்',
  ],
};

// ════════════════════════════════════════════════════════════════
// BLACKLIST CATEGORIES — each group is toggleable via gateConfig
// ════════════════════════════════════════════════════════════════
const BLACKLIST_GROUPS = {
  newsPolitics: [
    /\bnews\b/i, /\bsamachar\b/i, /\bkhabar\b/i, /\bవార్తలు\b/i, /\bசெய்தி\b/i,
    /\bbreaking\b/i, /\bheadlines\b/i, /\bdaily\s*news\b/i, /\btelevision\b/i,
    /\btv\s*(9|18|5|24|live)\b/i, /\bnews\s*(18|24|live|channel)\b/i,
    /\bpolitics\b/i, /\belection\b/i, /\bराजनीति\b/i,
    /\bcricket\b/i, /\bsports\s*news\b/i,
  ],
  musicFilm: [
    /\bofficial\s*channel\b/i, /\brecords\b/i, /\bmusic\s*label\b/i,
    /\bmovie\s*(trailer|review)\b/i, /\bfilm\b/i, /\bcinema\b/i,
  ],
  techElectronics: [
    // ── Tech / Electronics / Gadget review channels (block trimmer reviews from tech-focused creators) ──
    /\btech\s+(review|reviews|reviewer|reviewers|channel|guru|guruji|tips|news|updates|savvy|burner|world|zone|hub)\b/i,
    /\bgadget(s)?\s+(review|reviews|reviewer|channel|world|zone|hub|guru|guruji|tech)\b/i,
    /\bgadgets?\s*360\b/i,
    /\btechnical\s+guruji\b/i,
    /\bgeeky\s*ranjit\b/i, /\btechburner\b/i, /\btechno\s*ruhez\b/i,
    /\btrakin\s*tech\b/i, /\bbeebom\b/i, /\bmysmartprice\b/i,
    /\bsmartphone(s)?\s+(review|reviewer|reviews)\b/i,
    /\bmobile\s+(review|reviewer|reviews|phones?\s+review)\b/i,
    /\blaptop(s)?\s+(review|reviewer|reviews)\b/i,
    /\belectronics?\s+(review|reviews|channel|store|hub|world|guru|bazaar)\b/i,
    /\btechnology\s+(review|reviews|channel|guru)\b/i,
    /\bdigital\s+(trend|trends|gadget|gadgets)\b/i,
    /\bconsumer\s+electronics\b/i,
    /\bappliance(s)?\s+(review|reviews)\b/i,
    /\btech\s*(geek|geeks|nerd|nerds|freak|freaks|master|pro|maniac)\b/i,
    /\btrimmer\s+review\s+(channel|hub|world)\b/i,
  ],
  motivational: [
    // ── Motivational / self-help / spiritual / study-hacks channels ──
    // (e.g. "Decoding Success Kannada" — Gita psychology, study hacks, law-of-attraction)
    /\bdecoding\s+success\b/i,
    /\bcracking\s+success\b/i,
    /\bunlocking\s+(success|greatness|potential)\b/i,
    /\bgrowth\s+(revolution|mindset|hackers?|academy)\b/i,
    /\blevel\s+up\s+your\s+life\b/i,
    /\b(self[\s-]?help|motivation|motivational|inspirational)\s+(channel|guru|coach|speaker|videos?|content|talks?)\b/i,
    /\b(life|success|wealth|money|career|business)\s+(coach|coaching|mentor|mentorship|guru|gurus?|mantra)\b/i,
    /\bsuccess\s+(academy|stories|mindset|secret|secrets)\b/i,
    /\bmindset\s+(coach|shift|guru|secrets|revolution|academy)\b/i,
    /\b(law|secret)\s+of\s+attraction\b/i,
    /\bmanifest(ation)?\s+(coach|guru|secrets|academy)\b/i,
    /\bwealth\s+(creation|mantra|hacks?|secrets?)\b/i,
    /\b(gita|geeta|bhagavad)\s+(gyan|wisdom|teachings?|psychology|lessons?|saar|upay|path)\b/i,
    /\bbhagavad\s*gita\b/i,
    /\bbrahma\s*muhurta\b/i,
    /\bspiritual\s+(journey|awakening|wisdom|guru)\b/i,
    /\b(vedic|vedanta)\s+(wisdom|teachings?|lessons?)\b/i,
    /\b(exam|study|board)\s+(hacks?|tricks|strategy|strategies|motivation|topper|toppers)\b/i,
    /\bstudy\s+(faster|smarter|like\s+a)\b/i,
    /\bharvard(['']s)?\s+(rules?|habits|secrets?)\b/i,
    /\b(stop|quit)\s+wasting\s+(your\s+)?(life|time)\b/i,
    /\b(monk|sadhguru|premanand|yogi)\b/i,
    /\bproductivity\s+(hacks?|guru|coach|channel)\b/i,
    /\bhabits?\s+(of|for)\s+(highly|successful|winners|billionaires)\b/i,
  ],
};

// Build the active pattern list from a gate-config object
function getActivePatterns(gateConfig) {
  const active = [];
  if (gateConfig.blacklistNewsPolitics !== false) active.push(...BLACKLIST_GROUPS.newsPolitics);
  if (gateConfig.blacklistMusicFilm !== false) active.push(...BLACKLIST_GROUPS.musicFilm);
  if (gateConfig.blacklistTechElectronics !== false) active.push(...BLACKLIST_GROUPS.techElectronics);
  if (gateConfig.blacklistMotivational !== false) active.push(...BLACKLIST_GROUPS.motivational);
  return active;
}

// Full union (only used as a safety fallback when caller doesn't pass gateConfig)
const CHANNEL_BLACKLIST_PATTERNS = [
  ...BLACKLIST_GROUPS.newsPolitics,
  ...BLACKLIST_GROUPS.musicFilm,
  ...BLACKLIST_GROUPS.techElectronics,
  ...BLACKLIST_GROUPS.motivational,
];

// City-to-language mapping: if a channel description mentions these cities,
// it's a strong signal of which language region the creator belongs to.
// Used to PENALIZE channels that don't match the target language.
const CITY_LANGUAGE_MAP = {
  // Hindi belt cities
  'delhi': 'Hindi', 'noida': 'Hindi', 'gurgaon': 'Hindi', 'gurugram': 'Hindi',
  'lucknow': 'Hindi', 'jaipur': 'Hindi', 'bhopal': 'Hindi', 'patna': 'Hindi',
  'kanpur': 'Hindi', 'agra': 'Hindi', 'varanasi': 'Hindi', 'chandigarh': 'Hindi',
  'dehradun': 'Hindi', 'indore': 'Hindi', 'ranchi': 'Hindi', 'faridabad': 'Hindi',
  // Telugu cities
  'hyderabad': 'Telugu', 'vizag': 'Telugu', 'visakhapatnam': 'Telugu',
  'vijayawada': 'Telugu', 'tirupati': 'Telugu', 'warangal': 'Telugu',
  'guntur': 'Telugu', 'kakinada': 'Telugu', 'nellore': 'Telugu',
  // Tamil cities
  'chennai': 'Tamil', 'coimbatore': 'Tamil', 'madurai': 'Tamil',
  'trichy': 'Tamil', 'tiruchirappalli': 'Tamil', 'salem': 'Tamil',
  'erode': 'Tamil', 'tirunelveli': 'Tamil', 'vellore': 'Tamil',
  // Kannada cities
  'bangalore': 'Kannada', 'bengaluru': 'Kannada', 'mysore': 'Kannada',
  'mysuru': 'Kannada', 'hubli': 'Kannada', 'mangalore': 'Kannada',
  // Bengali cities
  'kolkata': 'Bengali', 'howrah': 'Bengali', 'durgapur': 'Bengali',
  'siliguri': 'Bengali', 'asansol': 'Bengali',
  // Marathi cities
  'mumbai': 'Marathi', 'pune': 'Marathi', 'nagpur': 'Marathi',
  'nashik': 'Marathi', 'aurangabad': 'Marathi', 'thane': 'Marathi',
  // Gujarati cities
  'ahmedabad': 'Gujarati', 'surat': 'Gujarati', 'vadodara': 'Gujarati',
  'rajkot': 'Gujarati', 'gandhinagar': 'Gujarati',
  // Malayalam cities
  'kochi': 'Malayalam', 'trivandrum': 'Malayalam', 'thiruvananthapuram': 'Malayalam',
  'calicut': 'Malayalam', 'kozhikode': 'Malayalam', 'thrissur': 'Malayalam',
  // Punjabi cities
  'amritsar': 'Punjabi', 'ludhiana': 'Punjabi', 'jalandhar': 'Punjabi',
  'patiala': 'Punjabi', 'bathinda': 'Punjabi', 'mohali': 'Punjabi',
  'phagwara': 'Punjabi', 'pathankot': 'Punjabi',
  // Odia cities
  'bhubaneswar': 'Odia', 'cuttack': 'Odia', 'rourkela': 'Odia',
  'puri': 'Odia', 'berhampur': 'Odia', 'sambalpur': 'Odia',
  'brahmapur': 'Odia',
};

// ── Geography gate — binary India pass/fail ──
// Primary signal: brandingSettings.channel.country from YouTube API
// Fallback: if country field absent, check comment language heuristic
// English and Hinglish are NEUTRAL — they don't indicate foreign or Indian
// Any non-English foreign language (Russian, French, Arabic, etc.) → foreign
const FOREIGN_LANGUAGE_PATTERNS = [
  // Russian / Cyrillic
  /[Ѐ-ӿ]{3,}/,
  // Arabic / Urdu script (but not standalone)
  /[؀-ۿ]{4,}/,
  // CJK (Chinese, Japanese, Korean)
  /[一-鿿぀-ゟ゠-ヿ가-힯]{2,}/,
  // Thai
  /[฀-๿]{3,}/,
  // Georgian
  /[Ⴀ-ჿ]{3,}/,
  // Greek
  /[Ͱ-Ͽ]{3,}/,
  // Latin-extended with diacritics heavy (French, Spanish, Portuguese, German)
  // These are trickier — we look for characteristic words instead
];

const FOREIGN_WORD_PATTERNS = [
  // Russian romanized markers
  /\b(spasibo|khorosho|ochen|molodets|privet|krasivo|ponyatno|zdorovo)\b/i,
  // French
  /\b(merci|bonjour|très|magnifique|incroyable|génial|superbe|formidable)\b/i,
  // Spanish
  /\b(gracias|hola|muy bien|excelente|increíble|maravilloso|hermoso)\b/i,
  // Portuguese
  /\b(obrigado|obrigada|muito bom|parabéns|incrível|maravilhoso)\b/i,
  // German
  /\b(danke|sehr gut|wunderbar|ausgezeichnet|fantastisch)\b/i,
  // Turkish
  /\b(teşekkürler|harika|mükemmel|güzel|çok iyi)\b/i,
  // Indonesian / Malay
  /\b(terima kasih|bagus sekali|mantap|keren banget|sangat bagus)\b/i,
  // Vietnamese
  /[Ơ-ưẠ-ỹ]{2,}/,
];

/**
 * Check if a channel passes the geography gate (India-based).
 * Returns { passed: boolean, reason: string }
 *
 * @param {object} channel - YouTube channel API response (with brandingSettings)
 * @param {string[]} comments - aggregated comments for this channel
 */
export function checkGeographyGate(channel, comments = []) {
  // Signal 1: YouTube API country field (strongest signal)
  const country = channel?.brandingSettings?.channel?.country;
  if (country) {
    const normalized = country.toUpperCase().trim();
    if (normalized === 'IN' || normalized === 'INDIA') {
      return { passed: true, reason: 'country:IN' };
    }
    // Explicit non-India country → fail
    return { passed: false, reason: `country:${normalized}` };
  }

  // Signal 2: No country set — use comment language heuristic
  // Check if majority of comments contain foreign (non-English, non-Indian) language
  if (comments.length < 5) {
    // Too few comments to judge — pass by default (benefit of the doubt)
    return { passed: true, reason: 'insufficient-data' };
  }

  let foreignScriptCount = 0;
  let foreignWordCount = 0;
  const sampleSize = Math.min(comments.length, 100);
  const sample = comments.slice(0, sampleSize);

  for (const comment of sample) {
    const clean = typeof comment === 'string' ? comment : '';
    // Check for foreign scripts
    const hasForeignScript = FOREIGN_LANGUAGE_PATTERNS.some(p => p.test(clean));
    if (hasForeignScript) foreignScriptCount++;
    // Check for foreign word markers
    const hasForeignWords = FOREIGN_WORD_PATTERNS.some(p => p.test(clean));
    if (hasForeignWords) foreignWordCount++;
  }

  const foreignRatio = (foreignScriptCount + foreignWordCount) / sampleSize;

  // If >30% of comments have foreign language markers → likely not Indian
  if (foreignRatio > 0.30) {
    return { passed: false, reason: `foreign-language-${Math.round(foreignRatio * 100)}%` };
  }

  // Default: pass (English-only channels with no country = could be Indian)
  return { passed: true, reason: 'no-foreign-signal' };
}

// Native-language search terms per category per language — highly specific to product niche
const NATIVE_QUERIES = {
  'Beard Oil & Beard Care': {
    English: [
      'beard oil honest review Indian men',
      'best beard growth oil India 2024 2025',
      'beard grooming routine Indian youtuber',
      'muuchstac beard oil review',
    ],
    Hindi: [
      'दाढ़ी का तेल कौन सा अच्छा है review',
      'बियर्ड ऑयल रिव्यू इंडिया',
      'beard oil review hindi youtuber',
      'दाढ़ी बढ़ाने का तरीका grooming',
    ],
    Telugu: [
      'beard oil review telugu youtuber',
      'గడ్డం పెరగడానికి ఆయిల్ రివ్యూ',
      'men grooming tips telugu beard',
      'తెలుగు grooming channel beard',
    ],
    Tamil: [
      'beard oil review tamil youtuber',
      'தாடி வளர எண்ணெய் ரிவியூ',
      'men grooming tamil beard tips',
      'தமிழ் grooming channel beard',
    ],
    Kannada: ['beard oil review kannada youtuber', 'ಗಡ್ಡ ಬೆಳವಣಿಗೆ ಆಯಿಲ್ ರಿವ್ಯೂ', 'men grooming kannada'],
    Bengali: ['beard oil review bangla youtuber', 'দাড়ির যত্ন তেল রিভিউ', 'men grooming bangla'],
    Marathi: ['beard oil review marathi youtuber', 'दाढीसाठी तेल रिव्ह्यू', 'men grooming marathi'],
    Gujarati: ['beard oil review gujarati youtuber', 'દાઢી માટે તેલ રિવ્યુ'],
    Malayalam: ['beard oil review malayalam youtuber', 'താടി വളർച്ച എണ്ണ റിവ്യൂ'],
    Punjabi: ['beard oil review punjabi youtuber', 'ਦਾੜ੍ਹੀ ਦਾ ਤੇਲ ਰਿਵਿਊ', 'men grooming punjabi beard'],
    Odia: ['beard oil review odia youtuber', 'ଦାଢ଼ି ତେଲ ରିଭ୍ୟୁ', 'men grooming odia beard'],
    'Mixed / Hinglish': ['beard oil review honest hindi', 'dadi ka tel best India review', 'beard grooming tips hinglish youtuber'],
  },
  'Face Wash & Face Care': {
    English: [
      'face wash review men India youtuber',
      'best face wash oily skin men India 2024 2025',
      'men skincare routine India honest review',
      'affordable face wash for men India',
    ],
    Hindi: [
      'फेस वॉश रिव्यू पुरुषों के लिए',
      'चेहरे की देखभाल पुरुष हिंदी review',
      'face wash review hindi men youtuber',
      'पिंपल हटाने का उपाय face wash',
    ],
    Telugu: [
      'face wash review telugu youtuber men',
      'మగవాళ్ల ఫేస్ వాష్ రివ్యూ తెలుగు',
      'skincare routine telugu men',
      'తెలుగు skincare channel face wash',
    ],
    Tamil: [
      'face wash review tamil youtuber men',
      'ஆண்களுக்கான ஃபேஸ் வாஷ் ரிவியூ',
      'skincare routine tamil men',
      'தமிழ் skincare channel',
    ],
    Kannada: ['face wash review kannada men', 'ಮುಖ ತೊಳೆಯುವ ರಿವ್ಯೂ ಕನ್ನಡ'],
    Bengali: ['face wash review bangla men', 'ফেস ওয়াশ রিভিউ বাংলা পুরুষ'],
    Marathi: ['face wash review marathi men', 'फेस वॉश रिव्ह्यू मराठी पुरुष'],
    Gujarati: ['face wash review gujarati men'],
    Malayalam: ['face wash review malayalam men'],
    Punjabi: ['face wash review punjabi men', 'ਫੇਸ ਵਾਸ਼ ਰਿਵਿਊ ਪੰਜਾਬੀ'],
    Odia: ['face wash review odia men', 'ଫେସ୍ ୱାଶ ରିଭ୍ୟୁ ଓଡ଼ିଆ'],
    'Mixed / Hinglish': ['face wash review honest hindi men', 'best face wash for men hinglish review'],
  },
  'Hair Styling & Hair Care': {
    English: [
      'hair wax clay review men India youtuber',
      'best hair styling products men India 2024 2025',
      'men hair care routine India honest review',
      'hair fall solution men India review',
    ],
    Hindi: [
      'बालों की देखभाल पुरुष हिंदी review',
      'हेयर वैक्स रिव्यू इंडिया',
      'hair styling review hindi men youtuber',
      'बालों का झड़ना कैसे रोके grooming',
    ],
    Telugu: [
      'hair styling review telugu youtuber men',
      'జుట్టు సంరక్షణ తెలుగు review',
      'hair fall solution telugu men',
      'తెలుగు hair care grooming channel',
    ],
    Tamil: [
      'hair styling review tamil youtuber men',
      'முடி பராமரிப்பு தமிழ் review',
      'hair fall solution tamil men',
      'தமிழ் hair care channel',
    ],
    Kannada: ['hair styling review kannada men', 'ಕೂದಲ ಆರೈಕೆ ಕನ್ನಡ review'],
    Bengali: ['hair styling review bangla men', 'চুলের যত্ন পুরুষ বাংলা review'],
    Marathi: ['hair styling review marathi men', 'केसांची काळजी मराठी review'],
    Gujarati: ['hair styling review gujarati men'],
    Malayalam: ['hair styling review malayalam men'],
    Punjabi: ['hair styling review punjabi men', 'ਵਾਲਾਂ ਦੀ ਸਟਾਈਲਿੰਗ ਪੰਜਾਬੀ'],
    Odia: ['hair styling review odia men', 'ଚୁଲ ସ୍ଟାଇଲିଂ ଓଡ଼ିଆ ରିଭ୍ୟୁ'],
    'Mixed / Hinglish': ['hair styling review hindi men youtuber', 'baalon ki dekhbhal tips hinglish'],
  },
  "Men's Grooming (General)": {
    English: [
      'men grooming routine India youtuber',
      'grooming essentials Indian men 2024 2025',
      'men grooming haul India honest review',
      'complete grooming routine men India',
    ],
    Hindi: [
      'पुरुषों की ग्रूमिंग रूटीन हिंदी',
      'men grooming tips hindi youtuber',
      'ग्रूमिंग प्रोडक्ट्स रिव्यू हिंदी',
      'grooming routine hindi men 2024 2025',
    ],
    Telugu: [
      'men grooming tips telugu youtuber',
      'పురుషుల గ్రూమింగ్ రివ్యూ తెలుగు',
      'grooming routine telugu men',
      'తెలుగు grooming channel men',
    ],
    Tamil: [
      'men grooming tips tamil youtuber',
      'ஆண்கள் க்ரூமிங் ரூடின் தமிழ்',
      'grooming routine tamil men',
      'தமிழ் grooming channel men',
    ],
    Kannada: ['men grooming tips kannada youtuber', 'ಪುರುಷರ ಗ್ರೂಮಿಂಗ್ ಕನ್ನಡ review'],
    Bengali: ['men grooming tips bangla youtuber', 'পুরুষদের গ্রুমিং বাংলা review'],
    Marathi: ['men grooming tips marathi youtuber', 'पुरुषांची ग्रूमिंग मराठी review'],
    Gujarati: ['men grooming tips gujarati youtuber'],
    Malayalam: ['men grooming tips malayalam youtuber'],
    Punjabi: ['men grooming tips punjabi youtuber', 'ਪੁਰਸ਼ ਗ੍ਰੂਮਿੰਗ ਪੰਜਾਬੀ'],
    Odia: ['men grooming tips odia youtuber', 'ପୁରୁଷ ଗ୍ରୁମିଂ ଓଡ଼ିଆ'],
    'Mixed / Hinglish': ['grooming tips hindi men youtuber', 'men grooming routine hinglish review'],
  },
  'Skincare & Serums': {
    English: [
      'serum review men India youtuber',
      'men skincare routine India 2024 2025',
      'best serum for men India honest review',
      'affordable skincare men India',
    ],
    Hindi: [
      'सीरम रिव्यू पुरुष हिंदी',
      'स्किनकेयर रूटीन हिंदी men',
      'serum review hindi men youtuber',
      'चेहरे के लिए बेस्ट सीरम review',
    ],
    Telugu: [
      'skincare review telugu men youtuber',
      'సీరమ్ రివ్యూ తెలుగు men',
      'skin care routine telugu men',
    ],
    Tamil: [
      'skincare review tamil men youtuber',
      'சீரம் ரிவியூ தமிழ் men',
      'skin care routine tamil men',
    ],
    Kannada: ['skincare review kannada men', 'ಸೀರಮ್ ರಿವ್ಯೂ ಕನ್ನಡ'],
    Bengali: ['skincare review bangla men', 'সিরাম রিভিউ বাংলা পুরুষ'],
    Marathi: ['skincare review marathi men', 'सीरम रिव्ह्यू मराठी'],
    Gujarati: ['skincare review gujarati men'],
    Malayalam: ['skincare review malayalam men'],
    Punjabi: ['skincare review punjabi men', 'ਸਕਿਨਕੇਅਰ ਰਿਵਿਊ ਪੰਜਾਬੀ'],
    Odia: ['skincare review odia men', 'ସ୍କିନକେୟାର ରିଭ୍ୟୁ ଓଡ଼ିଆ'],
    'Mixed / Hinglish': ['serum review hindi men youtuber', 'skin care routine hinglish men'],
  },
  'Deodorants & Perfumes': {
    English: [
      'best deodorant men India review youtuber',
      'perfume collection men India 2024 2025',
      'affordable perfume men India honest review',
      'long lasting deo men India review',
    ],
    Hindi: [
      'परफ्यूम रिव्यू हिंदी men',
      'बेस्ट डियोड्रेंट हिंदी review',
      'perfume review hindi men youtuber',
      'सस्ते अच्छे परफ्यूम review',
    ],
    Telugu: [
      'perfume review telugu youtuber men',
      'పెర్ఫ్యూమ్ రివ్యూ తెలుగు men',
      'deodorant review telugu men',
    ],
    Tamil: [
      'perfume review tamil youtuber men',
      'வாசனை திரவியம் ரிவியூ தமிழ் men',
      'deodorant review tamil men',
    ],
    Kannada: ['perfume review kannada men', 'ಪರ್ಫ್ಯೂಮ್ ರಿವ್ಯೂ ಕನ್ನಡ'],
    Bengali: ['perfume review bangla men', 'পারফিউম রিভিউ বাংলা'],
    Marathi: ['perfume review marathi men', 'परफ्यूम रिव्ह्यू मराठी'],
    Gujarati: ['perfume review gujarati men'],
    Malayalam: ['perfume review malayalam men'],
    Punjabi: ['perfume review punjabi men', 'ਪਰਫਿਊਮ ਰਿਵਿਊ ਪੰਜਾਬੀ'],
    Odia: ['perfume review odia men', 'ପରଫ୍ୟୁମ ରିଭ୍ୟୁ ଓଡ଼ିଆ'],
    'Mixed / Hinglish': ['perfume review hindi men youtuber', 'best deo review hinglish men'],
  },
  'Home Care & Air Fresheners': {
    English: [
      'air freshener review India youtuber',
      'best room freshener India 2024 2025',
      'godrej aer review honest',
      'home fragrance India review',
    ],
    Hindi: [
      'एयर फ्रेशनर रिव्यू हिंदी',
      'रूम फ्रेशनर बेस्ट हिंदी review',
      'godrej aer review hindi youtuber',
      'घर के लिए फ्रेशनर review',
    ],
    Telugu: [
      'air freshener review telugu youtuber',
      'ఎయిర్ ఫ్రెషనర్ రివ్యూ తెలుగు',
      'room freshener telugu review',
    ],
    Tamil: [
      'air freshener review tamil youtuber',
      'ஏர் ஃப்ரெஷ்னர் ரிவியூ தமிழ்',
      'room freshener tamil review',
    ],
    Kannada: ['air freshener review kannada'],
    Bengali: ['air freshener review bangla'],
    Marathi: ['air freshener review marathi'],
    Gujarati: ['air freshener review gujarati'],
    Malayalam: ['air freshener review malayalam'],
    Punjabi: ['air freshener review punjabi'],
    Odia: ['air freshener review odia'],
    'Mixed / Hinglish': ['air freshener review hindi youtuber', 'room freshener best hinglish review'],
  },
};

const LANG_MAP = {
  English: 'en', Hindi: 'hi', Tamil: 'ta', Telugu: 'te', Kannada: 'kn',
  Bengali: 'bn', Marathi: 'mr', Gujarati: 'gu', Malayalam: 'ml',
  Punjabi: 'pa', Odia: 'or', 'Mixed / Hinglish': 'hi',
};

// ════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS — all local, zero API calls, zero cost
// ════════════════════════════════════════════════════════════════

// Hard filter: reject obviously irrelevant channels
function isNotBlacklisted(channelName, channelDescription) {
  const fullText = `${channelName} ${channelDescription}`;
  return !CHANNEL_BLACKLIST_PATTERNS.some((pattern) => pattern.test(fullText));
}

// Parse ISO 8601 duration to seconds (e.g., "PT4M13S" → 253, "PT15S" → 15)
function parseDurationSeconds(iso) {
  if (!iso) return 0;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (parseInt(match[1] || '0') * 3600) + (parseInt(match[2] || '0') * 60) + parseInt(match[3] || '0');
}

// Category keyword relevance score (0–100)
function computeRelevanceScore(category, videoTitle, videoDescription, channelName, channelDescription) {
  const keywords = CATEGORY_RELEVANCE_KEYWORDS[category];
  if (!keywords) return 50;

  const titleText = `${videoTitle}`.toLowerCase();
  const descText = `${videoDescription}`.toLowerCase();
  const chText = `${channelName} ${channelDescription}`.toLowerCase();

  let score = 0;
  const titleHits = keywords.filter((kw) => titleText.includes(kw.toLowerCase())).length;
  score += Math.min(titleHits * 15, 45);
  const descHits = keywords.filter((kw) => descText.includes(kw.toLowerCase())).length;
  score += Math.min(descHits * 5, 15);
  const chHits = keywords.filter((kw) => chText.includes(kw.toLowerCase())).length;
  score += Math.min(chHits * 5, 20);
  if (keywords.some((kw) => channelName.toLowerCase().includes(kw.toLowerCase()))) score += 10;
  if (/review|routine|tutorial|tips|howto|how to|unboxing|haul|comparison|vs\b/i.test(videoTitle)) score += 10;

  return Math.min(score, 100);
}

// ── Native script detectors ──
const SCRIPT_DETECTORS = {
  Hindi: /[\u0900-\u097F]/,
  Telugu: /[\u0C00-\u0C7F]/,
  Tamil: /[\u0B80-\u0BFF]/,
  Kannada: /[\u0C80-\u0CFF]/,
  Bengali: /[\u0980-\u09FF]/,
  Marathi: /[\u0900-\u097F]/,
  Gujarati: /[\u0A80-\u0AFF]/,
  Malayalam: /[\u0D00-\u0D7F]/,
  Punjabi: /[\u0A00-\u0A7F]/,  // Gurmukhi script
  Odia: /[\u0B00-\u0B7F]/,     // Odia script
};

// ── Romanized (chat language) markers per language ──
// COMPREHENSIVE markers sourced from indian-lang-markers.md reference.
// Each language uses ONLY diagnostically unique words. Cross-language shared
// words (bhai, da, na, super, mast, nahi etc.) are excluded from regional
// languages to prevent false positives (e.g., Hindi channels leaking into
// Tamil results). Prioritised: copulas > pronouns > particles > vocabulary.
// See: https://en.wikipedia.org/wiki/Code-mixing for background.
const ROMANIZED_MARKERS = {
  // ── Hindi (Hinglish) — copula: hai/hain ──
  // Excluded: bhai (all langs), ji (generic), mast (shared PA/GU), dil (ambiguous)
  Hindi: /\b(hai|hain|kya|kyaa|yaar|accha|acha|achha|bahut|bhot|bohot|bahot|zyada|jyada|thoda|bilkul|kyunki|kyunke|lekin|sirf|abhi|phir|lagta|lagti|sahi|galat|haan|karna|karta|karo|raha|rahi|wala|waala|ekdum|zabardast|shaandar|kamaal|bakwas|wahiyat|arey|arre|kuchh|sabhi|kaise|kaisa)\b/i,

  // ── Tamil (Tanglish) — copula: iruku. Suffix: -nga, -kku ──
  // Excluded: da/di/pa (shared PA/TE/BN), anna/akka (shared), nalla (shared ML), nee (shared KN/ML)
  Tamil: /\b(romba|rombha|konjam|iruku|irukku|illa|illai|enna|ennaa|eppo|ippo|appuram|apram|sollu|solla|sollunga|paaru|pannunga|vaanga|theriyum|theriyaadhu|semma|sema|kalakkal|nanba|thambi|nandri|eppadi|poda|podaa|kastam|kashtam|pavam|vandhuchu|pannrom|solren|enakku|unakku|thamizh|macha)\b/i,

  // ── Telugu (Tenglish) — copula: undi. Suffix: -ga, -andi ──
  // Excluded: ra/ri (too short), lo/ki/tho (too short, shared), chinna (shared TA)
  Telugu: /\b(chala|chaala|bagundi|baagundi|andi|andee|kaadu|kadu|undi|undu|ledu|ledhu|ante|nenu|meeru|naaku|meeku|baaga|koncham|chesaru|cheppandi|vastundi|potundi|maama|bava|bavaa|gurinchi|ekkada|epudu|abbaa|enthaina|pedda|masthu|chesaanu|manchidi|manam|memu)\b/i,

  // ── Bengali (Banglish) — copula: ache. Progressive: -chhi ──
  // Excluded: dada (shared OD), bhai (shared), re (shared MR), ki (shared), apni (shared)
  Bengali: /\b(ache|aache|bhalo|ami|tumi|darun|fatafati|pagol|khub|kemon|bolo|dekho|korchi|korchhi|jacchi|ashchi|aschhi|hoyeche|hoyche|kharap|joss|kothai|kokhon|keno|ekdom|shono)\b/i,

  // ── Kannada (Kanglish) — copula: ide. Unique "very": thumba/tumba ──
  // Excluded: illa (shared TA), na/ri/le (too short), maga (generic), avanu/aval (shared)
  Kannada: /\b(ide|idhe|beku|beda|tumba|thumba|chennagide|chennagi|bombat|sakkath|olle|nodu|nodri|haelu|kaelu|jaasti|bahala|ivattu|naaley|nimma|namma|hege|hegidya|yaake|yelli|yaavaga|hushaaru|chindhi|byawarsi)\b/i,

  // ── Marathi (Minglish) — copula: aahe/ahe. Unique: mhanje, khup, zalay ──
  // Excluded: nahi (shared HI/OD/PA), re (shared BN), ka (too short), ho (shared)
  Marathi: /\b(aahe|ahe|mhanje|khup|chhan|zalay|jhala|zala|tyamule|barobar|bagha|sangto|deto|yevda|bhari|aahes|madhye|kuthe|kevha|aplya|tula|mala|gelo|gela|yeto|thambaa|parat|pudhe|kay|changali)\b/i,

  // ── Gujarati (Gujlish) — copula: chhe/chho/chhu. Unique: nathi, aavjo ──
  // Excluded: kem (too short solo), mast (shared HI/PA), bhai (shared), su/shu (too short)
  Gujarati: /\b(chhe|chho|chhu|nathi|saras|saru|saaru|aavjo|tamne|tane|badhu|kharido|mitro|thavu|thay|malyu|aavyu|majama|kem cho)\b/i,

  // ── Malayalam (Manglish) — copula: anu/aanu. Unique pronoun: njan ──
  // Excluded: nalla (shared TA), nee (shared), vaa/poo (shared TA), mole (English word in skincare)
  Malayalam: /\b(anu|aanu|alle|alleda|undo|undu|ille|illae|njan|njaanu|kollam|adipoli|mone|monee|moley|chetta|chechi|machaan|enthoru|enthu|evide|ingane|angane|paavam|pakshe|athayath|sheri|sheriyanu|ariyam|ariyilla|kando|parayaan|venam|venda|nammukku)\b/i,

  // ── Punjabi (Punglish) — NEW. Unique: tussi, wich, oye, paji ──
  // Excluded: hai (shared HI), da/di/de (shared TA/TE), yaar (shared HI), nahi (shared)
  Punjabi: /\b(tussi|tusi|kidda|kiddan|oye|oyee|paji|paaji|putt|puttar|wich|vich|vadiya|vadia|wadia|hunda|hundi|lagda|lagdi|naal|nal|layi|jatt|assi|asin|hanji|waheguru|sat sri akal)\b/i,

  // ── Odia — NEW. Unique copula: achhi/achi. Unique: kemiti, mun ──
  // Excluded: nahi (shared), bhai (shared), dada (shared BN), kharap (shared BN), sundar (shared)
  // Note: "pain" excluded despite being unique Odia dative — it's a common English word
  Odia: /\b(achhi|achi|kemiti|bhala|bhalaa|mun|tume|apana|ebe|pare|aaji|kana|kahibi|dekhibi|hela|jaichi|aasichi|deba|neba|heba|keunthi|kebe|sethare|ethare|kinichhi)\b/i,

  // ── Mixed / Hinglish (intentionally includes cross-language address terms) ──
  'Mixed / Hinglish': /\b(bhai|yaar|accha|bahut|sahi|ekdum|kya|dost|zabardast|shaandar)\b/i,
};

// ── Negative sentiment patterns (for Shorts bashing detection) ──
const NEGATIVE_PATTERNS = [
  /\b(fake|fraud|scam|waste|useless|worst|terrible|horrible|don'?t buy|avoid|trash|garbage|stupid|idiot|fool|spam)\b/i,
  /\b(bakwas|bekar|faltu|ghatiya|dhoka|bekaar|wahiyat|ganda|chutiya|bewakoof|pagal)\b/i,
  /\b(clickbait|misleading|lies|lying|liar|cheater|copied|copy)\b/i,
  /👎|🤮|😡|💩|🗑|🤡/,
];

// ── Multi-signal language detection for a channel ──
// Uses: YouTube API defaultLanguage, channel description script, video title script,
// city-language mapping, romanized markers. Returns weighted confidence.
function detectChannelLanguage(channelSnippet, videoTitles) {
  const scores = {}; // language → confidence score

  // Signal 1: YouTube's defaultLanguage field (strong if set)
  if (channelSnippet.defaultLanguage) {
    const code = channelSnippet.defaultLanguage.substring(0, 2);
    const reverseMap = {};
    for (const [lang, lc] of Object.entries(LANG_MAP)) {
      reverseMap[lc] = lang;
    }
    if (reverseMap[code]) {
      scores[reverseMap[code]] = (scores[reverseMap[code]] || 0) + 3.0;
    }
  }

  // Signal 2: Script detection in channel description
  const desc = channelSnippet.description || '';
  for (const [lang, regex] of Object.entries(SCRIPT_DETECTORS)) {
    if (regex.test(desc)) {
      scores[lang] = (scores[lang] || 0) + 2.0;
    }
  }

  // Signal 3: Script detection in video titles (strongest content signal)
  const titleText = videoTitles.join(' ');
  for (const [lang, regex] of Object.entries(SCRIPT_DETECTORS)) {
    const matches = titleText.match(new RegExp(regex.source, 'g'));
    if (matches && matches.length >= 2) {
      scores[lang] = (scores[lang] || 0) + 3.0;
    } else if (matches) {
      scores[lang] = (scores[lang] || 0) + 1.5;
    }
  }

  // Signal 4: Romanized language markers in description
  for (const [lang, regex] of Object.entries(ROMANIZED_MARKERS)) {
    if (regex.test(desc)) {
      scores[lang] = (scores[lang] || 0) + 1.0;
    }
  }

  // Signal 5: City mentions → language region
  const descLower = `${channelSnippet.title || ''} ${desc}`.toLowerCase();
  for (const [city, lang] of Object.entries(CITY_LANGUAGE_MAP)) {
    if (descLower.includes(city)) {
      scores[lang] = (scores[lang] || 0) + 2.0;
      break; // one city is enough
    }
  }

  // Signal 6: Language name explicitly mentioned in title/description
  // e.g., "Tamil grooming tips", "Telugu beauty channel" — strong signal
  const titleDescLower = `${channelSnippet.title || ''} ${desc}`.toLowerCase();
  for (const lang of Object.keys(LANG_MAP)) {
    if (lang !== 'English' && lang !== 'Mixed / Hinglish') {
      if (titleDescLower.includes(lang.toLowerCase())) {
        scores[lang] = (scores[lang] || 0) + 2.5;
      }
    }
  }

  // English baseline (most Indian creators have some English)
  scores['English'] = (scores['English'] || 0) + 0.5;

  // Sort by confidence
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return {
    primaryLanguage: sorted[0]?.[0] || 'English',
    allLanguages: sorted.map(([lang]) => lang),
    scores,
  };
}

// Language mismatch penalty using multi-signal detection
function getLanguageMismatchPenalty(channelLangInfo, targetLanguage) {
  if (targetLanguage === 'English' || targetLanguage === 'Mixed / Hinglish') return 0;

  const targetScore = channelLangInfo.scores[targetLanguage] || 0;
  const primaryLang = channelLangInfo.primaryLanguage;

  if (primaryLang === targetLanguage) return 0; // perfect match
  if (targetScore >= 2.0) return -5; // target language present with decent confidence
  if (targetScore > 0) return -15; // weak signal for target language

  // No signal at all for target language
  const primaryScore = channelLangInfo.scores[primaryLang] || 0;
  if (primaryScore >= 3.0) return -80; // very confident it's a different language — near elimination
  return -50; // moderately confident mismatch
}

// Detect languages present in a comment set
// Uses the 4-phase weighted pipeline (DA→EV→MP→CS) for romanized text,
// overlaid with native script detection for Devanagari/Tamil/etc. comments.
function detectCommentLanguages(comments) {
  if (!comments || comments.length === 0) return [];

  const detected = new Set();

  // Layer 1: Native script detection (Unicode block check)
  // The 4-phase pipeline handles romanized text; native script needs separate detection
  for (const [lang, regex] of Object.entries(SCRIPT_DETECTORS)) {
    if (comments.filter((c) => regex.test(c)).length >= 2) detected.add(lang);
  }

  // Layer 2: 4-phase weighted pipeline for romanized/transliterated comments
  // (DA: Diagnostic Anchors ×4, EV: Exclusive Vocab ×3, MP: Morpho Patterns ×2, CS: Shared Tokens ×1)
  const pipelineDetected = detectCommentLanguagesV2(comments);
  for (const lang of pipelineDetected) {
    detected.add(lang);
  }

  return [...detected];
}

// Pre-screen REGULAR video comments
function preScreenRegularComments(comments, category, targetLanguage) {
  if (!comments || comments.length === 0) {
    return { score: 0, detectedLanguages: [], productMentions: 0, negativeSentiment: 0 };
  }

  const keywords = CATEGORY_RELEVANCE_KEYWORDS[category] || [];
  let productMentions = 0;
  let negativeCount = 0;
  let substantiveCount = 0;

  for (const comment of comments) {
    const clean = comment.replace(/<[^>]*>/g, '');
    const lower = clean.toLowerCase();
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) productMentions++;
    if (NEGATIVE_PATTERNS.some((p) => p.test(clean))) negativeCount++;
    if (clean.trim().length > 15) substantiveCount++;
  }

  const n = comments.length;
  const detectedLanguages = detectCommentLanguages(comments);

  let score = 0;
  score += Math.min((productMentions / n) * 100, 35); // product discussion
  score += Math.min((substantiveCount / n) * 60, 25);  // real engagement
  score -= Math.min((negativeCount / n) * 50, 15);     // mild penalty for negativity

  // Language match
  if (targetLanguage === 'English') {
    if (detectedLanguages.includes('English')) score += 25;
  } else if (targetLanguage === 'Mixed / Hinglish') {
    if (detectedLanguages.includes('Hindi') || detectedLanguages.includes('English')) score += 25;
  } else {
    if (detectedLanguages.includes(targetLanguage)) score += 40;
    else if (detectedLanguages.includes('Hindi')) score += 5;
  }

  return {
    score: Math.max(Math.min(Math.round(score), 100), 0),
    detectedLanguages,
    productMentions,
    negativeSentiment: Math.round((negativeCount / n) * 100),
  };
}

// Pre-screen SHORTS comments — different expectations:
// Product mentions are EXTRA valuable (viewer engaged despite short format)
// Negative bashing is a RED FLAG (Shorts attract trolls, but creator-specific bashing = real problem)
function preScreenShortsComments(comments, category, targetLanguage) {
  if (!comments || comments.length === 0) {
    return { score: 0, detectedLanguages: [], productMentions: 0, negativeSentiment: 0, negativeCount: 0 };
  }

  const keywords = CATEGORY_RELEVANCE_KEYWORDS[category] || [];
  let productMentions = 0;
  let negativeCount = 0;

  for (const comment of comments) {
    const clean = comment.replace(/<[^>]*>/g, '');
    const lower = clean.toLowerCase();
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) productMentions++;
    if (NEGATIVE_PATTERNS.some((p) => p.test(clean))) negativeCount++;
  }

  const n = comments.length;
  const detectedLanguages = detectCommentLanguages(comments);
  const negativeRatio = negativeCount / n;

  let score = 0;
  score += Math.min((productMentions / n) * 150, 40); // product mentions in Shorts = extra valuable
  score -= Math.min(negativeRatio * 100, 40);          // heavy penalty for bashing

  // Language match
  if (targetLanguage !== 'English' && targetLanguage !== 'Mixed / Hinglish') {
    if (detectedLanguages.includes(targetLanguage)) score += 35;
  } else {
    if (detectedLanguages.includes('English')) score += 15;
  }

  return {
    score: Math.max(Math.min(Math.round(score), 100), 0),
    detectedLanguages,
    productMentions,
    negativeSentiment: Math.round(negativeRatio * 100),
    negativeCount,
  };
}

// Fetch comments for a single video (1 API unit). 100 is the YouTube API hard cap per request.
async function fetchComments(videoId, apiKey, maxResults = 100) {
  try {
    const url = `${YOUTUBE_API_BASE}/commentThreads?part=snippet&videoId=${videoId}&maxResults=${maxResults}&order=relevance&key=${apiKey}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data.items) {
        return {
          comments: data.items.map((item) => item.snippet.topLevelComment.snippet.textDisplay),
          commentsDisabled: false,
        };
      }
    } else {
      const err = await res.json().catch(() => ({}));
      if (err.error?.errors?.[0]?.reason === 'commentsDisabled') {
        return { comments: [], commentsDisabled: true };
      }
    }
  } catch (e) {}
  return { comments: [], commentsDisabled: false };
}

function getQueriesForLanguage(category, language) {
  const nativeQueries = NATIVE_QUERIES[category]?.[language];
  if (nativeQueries && nativeQueries.length > 0) return nativeQueries;
  const langSuffix = language === 'English' ? '' : ` ${language}`;
  return [
    `${category} review${langSuffix} India youtuber`,
    `${category} honest review${langSuffix} 2024 2025`,
    `best ${category}${langSuffix} India men review`,
  ];
}

// ════════════════════════════════════════════════════════════════
// PHASE 1: YouTube Search — no duration filter, gets BOTH Shorts and regular
// Returns raw unique videos (deduped by videoId, NOT by channel)
// ════════════════════════════════════════════════════════════════
async function searchForLanguage(category, langCode, langName, publishedAfter, apiKey) {
  const queries = getQueriesForLanguage(category, langName);
  const seenVideoIds = new Set();
  const allVideos = [];

  for (const query of queries) {
    try {
      // NO videoDuration filter — we want both Shorts AND regular videos
      const searchUrl = `${YOUTUBE_API_BASE}/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=25&relevanceLanguage=${langCode}&regionCode=IN&order=relevance&publishedAfter=${publishedAfter}&key=${apiKey}`;
      const res = await fetch(searchUrl);
      if (!res.ok) {
        const err = await res.json();
        const reason = err.error?.errors?.[0]?.reason;
        if (reason === 'quotaExceeded') throw new Error('QUOTA_EXCEEDED');
        if (reason === 'rateLimitExceeded' || res.status === 429) throw new Error('RATE_LIMITED');
        continue;
      }
      const data = await res.json();
      if (data.items) {
        for (const item of data.items) {
          const vid = item.id.videoId;
          if (vid && !seenVideoIds.has(vid)) {
            seenVideoIds.add(vid);
            allVideos.push(item);
          }
        }
      }
    } catch (e) {
      if (e.message === 'QUOTA_EXCEEDED' || e.message === 'RATE_LIMITED') throw e;
    }
  }

  return allVideos;
}

// ════════════════════════════════════════════════════════════════
// MAIN PIPELINE
// ════════════════════════════════════════════════════════════════
export async function searchYouTube(params) {
  const { category, subscriberRange, languages, maxResults, apiKey, videoFormat, userLearnings, gateConfig } = params;
  // Normalise gateConfig so every downstream check can trust the shape
  const gates = {
    strictRegionalLanguage: true,
    blacklistNewsPolitics: true,
    blacklistMusicFilm: true,
    blacklistTechElectronics: true,
    blacklistMotivational: true,
    applyUserLearnings: true,
    ...(gateConfig || {}),
  };
  const activePatterns = getActivePatterns(gates);
  const isNotBlacklistedActive = (name, desc) => {
    if (activePatterns.length === 0) return true;
    const fullText = `${name} ${desc}`;
    return !activePatterns.some((p) => p.test(fullText));
  };
  // videoFormat: 'long' = only long-form, 'short' = only Shorts, 'mixed' = both (default)

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const publishedAfter = sixMonthsAgo.toISOString();

  const selectedLangs = (languages && languages.length > 0) ? languages : ['English'];
  const totalTarget = maxResults || 20;
  const perLangLimit = Math.ceil(totalTarget / selectedLangs.length);
  const OVERFETCH = 3;

  // ── User-driven learning blocklist ──
  // The Results page ships an array of { channelId, keywords } entries here
  // whenever the user clicks "Not relevant" on a creator. We treat the
  // channelId as a permanent block and the keywords as additional blacklist
  // patterns that match against channel name/description.
  const blockedChannelIds = new Set();
  const blockedKeywords = [];
  if (Array.isArray(userLearnings)) {
    for (const learning of userLearnings) {
      if (learning?.channelId) blockedChannelIds.add(learning.channelId);
      if (Array.isArray(learning?.keywords)) {
        for (const k of learning.keywords) {
          if (typeof k === 'string' && k.length >= 3) blockedKeywords.push(k.toLowerCase());
        }
      }
    }
  }
  const isBlockedByLearning = (channel) => {
    if (blockedChannelIds.has(channel.id)) return true;
    if (blockedKeywords.length === 0) return false;
    const haystack = `${channel.snippet.title || ''} ${channel.snippet.description || ''}`.toLowerCase();
    return blockedKeywords.some((k) => haystack.includes(k));
  };

  // ═══ PHASE 1: YouTube Search (no duration filter) ═══
  // Collects ALL videos — Shorts and regular — tagged with search language
  const rawVideosByLang = {};
  for (const lang of selectedLangs) {
    const langCode = LANG_MAP[lang] || 'en';
    rawVideosByLang[lang] = await searchForLanguage(category, langCode, lang, publishedAfter, apiKey);
  }

  // ═══ PHASE 2: Classify videos — fetch contentDetails to get duration ═══
  const allVideoIds = Object.values(rawVideosByLang).flat().map((v) => v.id.videoId).filter(Boolean);
  const videoMeta = new Map(); // videoId → { durationSec, isShort, stats }

  for (let i = 0; i < allVideoIds.length; i += 50) {
    const batch = allVideoIds.slice(i, i + 50);
    try {
      const url = `${YOUTUBE_API_BASE}/videos?part=contentDetails,statistics&id=${batch.join(',')}&key=${apiKey}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.items) {
        for (const v of data.items) {
          const sec = parseDurationSeconds(v.contentDetails?.duration);
          videoMeta.set(v.id, {
            durationSec: sec,
            isShort: sec > 0 && sec <= 60,
            stats: v.statistics || {},
          });
        }
      }
    } catch (e) {}
  }

  // ═══ PHASE 3: Group by channel — per language, collect Shorts + regular separately ═══
  // Structure: channelId → { regulars: [], shorts: [], language }
  const channelGroups = new Map();

  for (const [lang, videos] of Object.entries(rawVideosByLang)) {
    for (const video of videos) {
      const channelId = video.snippet.channelId;
      const videoId = video.id.videoId;
      const meta = videoMeta.get(videoId);
      const key = `${channelId}_${lang}`; // same channel can appear in different language searches

      if (!channelGroups.has(key)) {
        channelGroups.set(key, { channelId, regulars: [], shorts: [], language: lang });
      }

      const group = channelGroups.get(key);
      const entry = { video, videoId, meta };

      if (meta?.isShort) {
        group.shorts.push(entry);
      } else {
        group.regulars.push(entry);
      }
    }
  }

  // ═══ PHASE 3b: Format filter — keep only channels matching requested video format ═══
  const format = videoFormat || 'mixed';
  if (format !== 'mixed') {
    for (const [key, group] of channelGroups) {
      if (format === 'long' && group.regulars.length === 0) {
        channelGroups.delete(key); // user wants long-form only, channel has none
      } else if (format === 'short' && group.shorts.length === 0) {
        channelGroups.delete(key); // user wants Shorts only, channel has none
      }
    }
  }

  // ═══ PHASE 4: Channel profiling — fetch details, detect language, blacklist ═══
  const uniqueChannelIds = [...new Set([...channelGroups.values()].map((g) => g.channelId))];
  const channelDetails = new Map();

  for (let i = 0; i < uniqueChannelIds.length; i += 50) {
    const batch = uniqueChannelIds.slice(i, i + 50);
    try {
      const url = `${YOUTUBE_API_BASE}/channels?part=snippet,statistics,topicDetails,brandingSettings&id=${batch.join(',')}&key=${apiKey}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.items) {
        for (const ch of data.items) channelDetails.set(ch.id, ch);
      }
    } catch (e) {}
  }

  const subRanges = {
    nano: [1000, 10000], micro: [10000, 100000],
    mid: [100000, 500000], macro: [500000, Infinity],
  };
  const [minSubs, maxSubs] = subRanges[subscriberRange] || [0, Infinity];

  // ═══ PHASE 5: Score, robustness gates, and filter ═══
  const candidates = [];
  const gateStats = { passed: 0, rejected: 0, byGate: {} };

  for (const [, group] of channelGroups) {
    const channel = channelDetails.get(group.channelId);
    if (!channel) continue;

    const subs = parseInt(channel.statistics.subscriberCount || '0', 10);
    if (subs < minSubs || subs >= maxSubs) continue;

    const chName = channel.snippet.title || '';
    const chDesc = channel.snippet.description || '';
    if (!isNotBlacklistedActive(chName, chDesc)) continue;

    // User-driven "Not relevant" blocklist — toggleable via gateConfig
    if (gates.applyUserLearnings && isBlockedByLearning(channel)) continue;

    // ── Robustness Gates (4-gate fraud/relevance filter) ──
    const allEntries = [...group.regulars, ...group.shorts];
    const allTitles = allEntries.map((e) => e.video.snippet.title || '');

    // Compute metrics for Gate 3 (engagement sanity)
    const totalViews = parseInt(channel.statistics.viewCount || '0', 10);
    const totalVideos = parseInt(channel.statistics.videoCount || '0', 10);
    const avgViewsPerVideo = totalVideos > 0 ? totalViews / totalVideos : 0;

    let totalSampledViews = 0, totalSampledEngagement = 0;
    for (const e of allEntries) {
      const sv = parseInt(e.meta?.stats?.viewCount || '0', 10);
      const sl = parseInt(e.meta?.stats?.likeCount || '0', 10);
      const sc = parseInt(e.meta?.stats?.commentCount || '0', 10);
      totalSampledViews += sv;
      totalSampledEngagement += sl + sc;
    }
    const engagementRate = totalSampledViews > 0
      ? (totalSampledEngagement / totalSampledViews) * 100
      : 0;

    const gateMetrics = { subscriberCount: subs, avgViewsPerVideo, engagementRate };
    const gateResult = await runAllGates(channel, allTitles, gateMetrics, process.env.CLAUDE_API_KEY);
    if (!gateResult.passed) {
      gateStats.rejected++;
      gateStats.byGate[gateResult.failedAt] = (gateStats.byGate[gateResult.failedAt] || 0) + 1;
      continue;
    }
    gateStats.passed++;

    // Multi-signal language detection
    const channelLang = detectChannelLanguage(channel.snippet, allTitles);

    // Pick best regular video (by category relevance) and best Short (by views)
    const scoreEntry = (e) => computeRelevanceScore(category, e.video.snippet.title || '', e.video.snippet.description || '', chName, chDesc);
    group.regulars.sort((a, b) => scoreEntry(b) - scoreEntry(a));
    group.shorts.sort((a, b) => {
      const viewsA = parseInt(a.meta?.stats?.viewCount || '0', 10);
      const viewsB = parseInt(b.meta?.stats?.viewCount || '0', 10);
      return viewsB - viewsA;
    });

    const bestRegular = group.regulars[0] || null;
    const bestShort = group.shorts[0] || null;
    if (!bestRegular && !bestShort) continue;

    // Pick primary video based on user's format preference
    let primaryEntry;
    if (format === 'short') primaryEntry = bestShort || bestRegular;
    else if (format === 'long') primaryEntry = bestRegular || bestShort;
    else primaryEntry = bestRegular || bestShort; // mixed: prefer regular but accept Short
    let relevance = scoreEntry(primaryEntry);

    // Language mismatch penalty (multi-signal)
    relevance += getLanguageMismatchPenalty(channelLang, group.language);

    // No penalty for video format — Shorts creators are equally valid
    relevance = Math.max(relevance, 0);

    // Collect ALL video publish dates for channel momentum calculation
    const allVideoPublishDates = [
      ...group.regulars.map((e) => e.video?.snippet?.publishedAt).filter(Boolean),
      ...group.shorts.map((e) => e.video?.snippet?.publishedAt).filter(Boolean),
    ];

    candidates.push({
      channel, channelId: group.channelId, language: group.language,
      bestRegular, bestShort, channelLang, relevance,
      // Keep the top-N sorted lists so Phase 6 can aggregate comments across
      // multiple videos per creator — dramatically increases the comment
      // corpus Claude sees per channel (from ~25 → ~150).
      topRegulars: group.regulars.slice(0, 2),
      topShorts: group.shorts.slice(0, 2),
      isShortOnly: !bestRegular,
      regularCount: group.regulars.length,
      shortsCount: group.shorts.length,
      allVideoPublishDates,
    });
  }

  // Sort, take top 3x per language for comment analysis
  const langBuckets = {};
  for (const lang of selectedLangs) {
    langBuckets[lang] = candidates
      .filter((c) => c.language === lang)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, perLangLimit * OVERFETCH);
  }

  // ═══ PHASE 6: Comment fetching + local pre-screening ═══
  // Pull comments from the TOP 2 regular videos and TOP 2 shorts per creator,
  // 100 per request (YouTube's hard cap), dedupe. Budget per creator = ~4
  // units of YT quota — well within the 10k daily cap even at 50-result
  // searches. This pushes the corpus Claude analyses from ~25 to ~150+
  // comments per channel.
  const allCandidatesFlat = Object.values(langBuckets).flat();

  const harvestComments = async (entries, perVideoCap) => {
    const pool = [];
    let anyDisabled = false;
    const seen = new Set();
    for (const e of entries) {
      if (!e?.videoId) continue;
      const { comments, commentsDisabled } = await fetchComments(e.videoId, apiKey, perVideoCap);
      if (commentsDisabled) anyDisabled = true;
      for (const c of comments) {
        // Dedupe on a normalized key — strips HTML entities that differ between
        // responses but decode to the same text.
        const key = typeof c === 'string' ? c.replace(/\s+/g, ' ').trim() : '';
        if (key && !seen.has(key)) {
          seen.add(key);
          pool.push(c);
        }
      }
    }
    return { comments: pool, commentsDisabled: anyDisabled && pool.length === 0 };
  };

  for (const c of allCandidatesFlat) {
    // Regular video comments — aggregated across top 2 regulars
    if (c.topRegulars && c.topRegulars.length > 0) {
      const r = await harvestComments(c.topRegulars, 100);
      c.regularComments = r.comments;
      c.regularCommentsDisabled = r.commentsDisabled;
    } else {
      c.regularComments = [];
      c.regularCommentsDisabled = false;
    }

    // Shorts comments — aggregated across top 2 shorts
    if (c.topShorts && c.topShorts.length > 0) {
      const s = await harvestComments(c.topShorts, 100);
      c.shortsComments = s.comments;
      c.shortsCommentsDisabled = s.commentsDisabled;
    } else {
      c.shortsComments = [];
      c.shortsCommentsDisabled = false;
    }

    // Pre-screen REGULAR comments
    c.regularScreen = preScreenRegularComments(c.regularComments, category, c.language);
    // Pre-screen SHORTS comments (different scoring — detects bashing)
    c.shortsScreen = preScreenShortsComments(c.shortsComments, category, c.language);

    // Combined score: title relevance + comment quality
    let commentScore;
    if (c.regularComments.length > 0 && c.shortsComments.length > 0) {
      commentScore = c.regularScreen.score * 0.65 + c.shortsScreen.score * 0.35;
    } else if (c.regularComments.length > 0) {
      commentScore = c.regularScreen.score;
    } else if (c.shortsComments.length > 0) {
      commentScore = c.shortsScreen.score;
    } else {
      commentScore = 0;
    }

    c.combinedScore = Math.round(c.relevance * 0.5 + commentScore * 0.5);

    // If Shorts have high negative sentiment (>30%), additional penalty
    if (c.shortsScreen.negativeSentiment > 30) {
      c.combinedScore -= Math.min(c.shortsScreen.negativeSentiment - 30, 25);
    }
    c.combinedScore = Math.max(c.combinedScore, 0);
  }

  // ═══ PHASE 6b: Language quality gate for regional searches ═══
  // For regional language targets (Tamil, Telugu, Kannada, etc.), enforce that
  // candidates must have at least SOME target-language signal — either in the
  // channel profile (titles, description, API fields) or in the comments.
  // This prevents Hindi/English channels from dominating regional searches
  // just because YouTube's relevanceLanguage parameter is a weak hint.
  for (const lang of selectedLangs) {
    const isRegional = lang !== 'English' && lang !== 'Mixed / Hinglish';
    if (!isRegional) continue;

    const bucket = langBuckets[lang] || [];
    const withSignal = [];
    const withoutSignal = [];

    for (const c of bucket) {
      // Require score >= 1.5 — this means at least one strong signal
      // (script detection, YouTube API field, city match, or language name),
      // not just romanized markers in description which score only +1.0
      const channelHasSignal = (c.channelLang.scores[lang] || 0) >= 1.5;
      const commentsHaveSignal = c.regularScreen.detectedLanguages.includes(lang) ||
                                 c.shortsScreen.detectedLanguages.includes(lang);
      if (channelHasSignal || commentsHaveSignal) {
        withSignal.push(c);
      } else {
        withoutSignal.push(c);
      }
    }

    // STRICT regional gate (toggleable via gateConfig.strictRegionalLanguage):
    // when enabled, regional-language buckets DROP the without-signal pool
    // entirely — padding Bengali with Dan C Bearded or Odia with Garrick
    // Dixon is worse than returning zero for that language. When disabled,
    // fall back to the without-signal pool if the signalled pool is empty
    // (the old lenient behaviour).
    if (gates.strictRegionalLanguage) {
      langBuckets[lang] = withSignal;
    } else if (withSignal.length > 0) {
      langBuckets[lang] = withSignal;
    }
    // else: lenient mode + no signalled candidates — keep withoutSignal as-is
  }

  // ═══ PHASE 7: Final selection — top N per language by combined score ═══
  // Take more than the per-language quota at first so we have a backfill pool
  // after dedup; the same channelId can legitimately appear in multiple
  // language buckets (English + Hinglish, etc.) and we don't want to ship it
  // twice.
  const perLangPool = [];
  for (const lang of selectedLangs) {
    const pool = (langBuckets[lang] || [])
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, perLangLimit * 2); // overfetch so dedup doesn't starve us
    perLangPool.push(...pool);
  }

  // Dedupe by channelId, keeping the highest-scoring entry per channel.
  const dedupMap = new Map();
  for (const c of perLangPool) {
    const existing = dedupMap.get(c.channelId);
    if (!existing || c.combinedScore > existing.combinedScore) {
      dedupMap.set(c.channelId, c);
    }
  }
  const finalResults = [...dedupMap.values()].sort(
    (a, b) => b.combinedScore - a.combinedScore
  );

  const limited = finalResults.slice(0, totalTarget);

  // Compute languageBreakdown from ACTUAL displayed results (after totalTarget slice),
  // not the pre-slice pools — avoids showing "Tamil: 3 found" when only 2 are displayed
  const languageBreakdown = {};
  for (const lang of selectedLangs) {
    languageBreakdown[lang] = limited.filter((c) => c.language === lang).length;
  }

  // ═══ PHASE 8: Build result objects with full metadata for Claude ═══
  const results = limited.map((c) => {
    let primaryEntry;
    if (format === 'short') primaryEntry = c.bestShort || c.bestRegular;
    else if (format === 'long') primaryEntry = c.bestRegular || c.bestShort;
    else primaryEntry = c.bestRegular || c.bestShort;
    const primaryStats = primaryEntry.meta?.stats || {};

    // Merge comments: regular first, then Shorts (Claude gets both, labeled)
    const allComments = c.regularComments.length > 0 ? c.regularComments : c.shortsComments;

    return {
      videoId: primaryEntry.videoId,
      videoTitle: primaryEntry.video.snippet.title,
      videoDescription: primaryEntry.video.snippet.description,
      videoThumbnail: primaryEntry.video.snippet.thumbnails?.high?.url || primaryEntry.video.snippet.thumbnails?.default?.url,
      publishedAt: primaryEntry.video.snippet.publishedAt,
      channelId: c.channel.id,
      channelName: c.channel.snippet.title,
      channelThumbnail: c.channel.snippet.thumbnails?.default?.url,
      channelDescription: c.channel.snippet.description,
      subscriberCount: parseInt(c.channel.statistics.subscriberCount || '0', 10),
      totalViews: parseInt(c.channel.statistics.viewCount || '0', 10),
      totalVideos: parseInt(c.channel.statistics.videoCount || '0', 10),
      videoViewCount: parseInt(primaryStats.viewCount || '0', 10),
      videoLikeCount: parseInt(primaryStats.likeCount || '0', 10),
      videoCommentCount: parseInt(primaryStats.commentCount || '0', 10),
      comments: allComments,
      commentsDisabled: c.regularCommentsDisabled && c.shortsCommentsDisabled,
      searchLanguage: c.language,
      // Channel profile (for Claude and display)
      _channelProfile: {
        detectedLanguage: c.channelLang.primaryLanguage,
        allDetectedLanguages: c.channelLang.allLanguages,
        isShortOnly: c.isShortOnly,
        hasRegularContent: !!c.bestRegular,
        hasShorts: !!c.bestShort,
        regularVideoCount: c.regularCount,
        shortsVideoCount: c.shortsCount,
        regularVideoTitle: c.bestRegular?.video.snippet.title || null,
        shortsVideoTitle: c.bestShort?.video.snippet.title || null,
      },
      // Shorts-specific data (separate analysis branch for Claude)
      _shortsData: c.bestShort ? {
        videoId: c.bestShort.videoId,
        title: c.bestShort.video.snippet.title,
        durationSec: c.bestShort.meta?.durationSec || 0,
        viewCount: parseInt(c.bestShort.meta?.stats?.viewCount || '0', 10),
        likeCount: parseInt(c.bestShort.meta?.stats?.likeCount || '0', 10),
        comments: c.shortsComments,
        negativeSentiment: c.shortsScreen.negativeSentiment,
        negativeCount: c.shortsScreen.negativeCount,
      } : null,
      // Geography data for binary gate
      _geoCountry: c.channel?.brandingSettings?.channel?.country || null,
      // Video publish dates for channel momentum calculation
      _videoPublishDates: c.allVideoPublishDates || [],
      // 4-phase language detection metadata (weighted pipeline results)
      _languageDetection: getDetectionDetails(allComments),
      // Pre-screening scores (for debugging)
      _preScreen: {
        titleRelevance: c.relevance,
        regularCommentScore: c.regularScreen.score,
        shortsCommentScore: c.shortsScreen.score,
        shortsNegativeSentiment: c.shortsScreen.negativeSentiment,
        combinedScore: c.combinedScore,
        detectedCommentLanguages: [...new Set([...c.regularScreen.detectedLanguages, ...c.shortsScreen.detectedLanguages])],
        regularProductMentions: c.regularScreen.productMentions,
        shortsProductMentions: c.shortsScreen.productMentions,
      },
    };
  });

  // Log gate stats for debugging
  console.log(`[Robustness Gates] Passed: ${gateStats.passed}, Rejected: ${gateStats.rejected}`, gateStats.byGate);

  return { results, languageBreakdown, _gateStats: gateStats };
}
