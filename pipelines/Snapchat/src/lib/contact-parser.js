/**
 * Contact extraction from creator bios.
 * Parses phone numbers, WhatsApp, Instagram, YouTube, Twitter, and URLs.
 * Zero dependencies. Shared by ShareChat and Snapchat pipelines.
 */

/**
 * Parse contact information from a bio string and optional structured fields.
 *
 * @param {string} bio - Creator bio text
 * @param {Object} [extras] - Additional structured fields (Snapchat: websiteUrl, address)
 * @returns {Object} Parsed contacts
 */
export function parseContacts(bio = '', extras = {}) {
  const text = [bio, extras.websiteUrl || '', extras.address || ''].join(' ');

  return {
    phone: extractPhone(text),
    whatsapp: extractWhatsApp(text),
    instagram: extractInstagram(text),
    youtube: extractYouTube(text),
    twitter: extractTwitter(text),
    otherLinks: extractOtherLinks(text),
  };
}

// ─── Phone ───

function extractPhone(text) {
  // Indian mobile: 10 digits starting with 6-9, optional +91 prefix
  const match = text.match(/(?:\+91[\s.-]?)?([6-9]\d{9})\b/);
  return match ? match[1] : null;
}

// ─── WhatsApp ───

function extractWhatsApp(text) {
  // wa.me link
  const waLink = text.match(/wa\.me\/(\d{10,13})/i);
  if (waLink) return waLink[1];

  // "whatsapp" near a phone number
  const waContext = text.match(/whatsapp[\s:.\-=]*(?:\+91[\s.-]?)?([6-9]\d{9})\b/i);
  if (waContext) return waContext[1];

  // Phone number near "whatsapp" (reversed)
  const waReverse = text.match(/(?:\+91[\s.-]?)?([6-9]\d{9})[\s:.\-=]*whatsapp/i);
  if (waReverse) return waReverse[1];

  return null;
}

// ─── Instagram ───

function extractInstagram(text) {
  // URL: instagram.com/handle
  const urlMatch = text.match(/instagram\.com\/([a-zA-Z0-9._]{1,30})\b/i);
  if (urlMatch && !isReservedIG(urlMatch[1])) return urlMatch[1];

  // "insta" / "ig" followed by handle
  const labelMatch = text.match(/(?:insta(?:gram)?|ig)\s*[:=\-|]+\s*@?([a-zA-Z0-9._]{1,30})\b/i);
  if (labelMatch && !isReservedIG(labelMatch[1])) return labelMatch[1];

  // "insta" / "ig" followed by @handle on next word
  const atMatch = text.match(/(?:insta(?:gram)?|ig)\s+@([a-zA-Z0-9._]{1,30})\b/i);
  if (atMatch && !isReservedIG(atMatch[1])) return atMatch[1];

  return null;
}

function isReservedIG(handle) {
  return ['p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'about'].includes(handle.toLowerCase());
}

// ─── YouTube ───

function extractYouTube(text) {
  // URL: youtube.com/@handle or youtube.com/channel/...
  const urlMatch = text.match(/youtube\.com\/@?([a-zA-Z0-9._\-]{1,50})\b/i);
  if (urlMatch && !isReservedYT(urlMatch[1])) return urlMatch[1];

  // youtu.be/...
  const shortMatch = text.match(/youtu\.be\/([a-zA-Z0-9._\-]+)/i);
  if (shortMatch) return shortMatch[1];

  // "youtube" / "yt" followed by handle
  const labelMatch = text.match(/(?:youtube|yt)\s*[:=\-|]+\s*@?([a-zA-Z0-9._\-]{1,50})\b/i);
  if (labelMatch && !isReservedYT(labelMatch[1])) return labelMatch[1];

  return null;
}

function isReservedYT(handle) {
  return ['watch', 'channel', 'c', 'user', 'playlist', 'results', 'feed', 'about'].includes(handle.toLowerCase());
}

// ─── Twitter / X ───

function extractTwitter(text) {
  // URL: twitter.com/handle or x.com/handle
  const urlMatch = text.match(/(?:twitter|x)\.com\/([a-zA-Z0-9_]{1,15})\b/i);
  if (urlMatch && !isReservedX(urlMatch[1])) return urlMatch[1];

  // "twitter" followed by handle
  const labelMatch = text.match(/(?:twitter)\s*[:=\-|]+\s*@?([a-zA-Z0-9_]{1,15})\b/i);
  if (labelMatch && !isReservedX(labelMatch[1])) return labelMatch[1];

  return null;
}

function isReservedX(handle) {
  return ['home', 'explore', 'search', 'settings', 'i', 'intent'].includes(handle.toLowerCase());
}

// ─── Other Links ───

function extractOtherLinks(text) {
  const urlPattern = /https?:\/\/[^\s"'<>,)}\]]{5,}/gi;
  const allUrls = text.match(urlPattern) || [];

  // Filter out URLs already captured by platform extractors
  const platformDomains = ['instagram.com', 'youtube.com', 'youtu.be', 'twitter.com', 'x.com', 'wa.me', 'whatsapp.com'];
  return allUrls.filter(url => {
    const lower = url.toLowerCase();
    return !platformDomains.some(d => lower.includes(d));
  }).slice(0, 5); // cap at 5
}
