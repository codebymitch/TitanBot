import { createHash } from 'crypto';
import axios from 'axios';

// ── Text-based detection ─────────────────────────────────────────────────────

const SCAM_DOMAINS = [
  'cobratate', 'tatespeech', 'hustlersuniversity', 'cobracasino',
  'cryptofire', 'bit.ly', 'tinyurl', 'shorturl', 'cutt.ly',
  'stake.com', 'rollbit', 'duelbits', 'bc.game', 'roobet',
  'wolf.bet', 'gamdom', 'csgoroll', 'csgoempire', 'skinclub',
  'csgopolygon', 'clash.gg', 'thunderpick',
];

const KEYWORD_GROUPS = [
  ['promo code', 'promocode', 'promo-code'],
  ['claim your reward', 'claim reward', 'claim your bonus'],
  ['withdrawal success', 'withdrawal was successful', 'withdrew'],
  ['free money', 'free crypto', 'free usdt', 'free btc', 'free eth'],
  ['giveaway', 'giving away', 'giving $', 'giving away $'],
  ['casino', 'gambling', 'bet with', 'place your bet'],
  ['register now', 'sign up now', 'join now and get'],
  ['$2,500', '$2500', '$1,000', '$1000', '$500 bonus', '$100 free'],
  ['andrew tate', 'cobratate', 'tate'],
];

const HIGH_CONFIDENCE = [
  'cobratate.com', 'tatespeech.com', 'cryptofire.io',
  'enter the promo code', 'use code launch', 'use code: launch',
  'airdrop is live', 'claim your airdrop',
  'send 1 btc get 2 btc', 'send 1 eth get 2 eth',
  'elon musk giveaway', 'verify your wallet',
  'connect your wallet to claim',
];

function isTextScam(content, embeds = []) {
  const allText = [
    content,
    ...embeds.map(e => [e.title, e.description, e.url, ...(e.fields?.map(f => f.value) ?? [])].join(' ')),
  ].join(' ').toLowerCase();

  if (HIGH_CONFIDENCE.some(kw => allText.includes(kw))) return true;
  if (SCAM_DOMAINS.some(d => allText.includes(d))) return true;

  let matched = 0;
  for (const group of KEYWORD_GROUPS) {
    if (group.some(kw => allText.includes(kw))) matched++;
  }
  return matched >= 3;
}

// ── Image hash detection ─────────────────────────────────────────────────────

// In-memory cache loaded from DB on first use
let _hashCache = null;

async function loadHashes(db) {
  if (_hashCache) return _hashCache;
  const stored = await db.get('scam:image-hashes').catch(() => null);
  _hashCache = new Set(stored ?? []);
  return _hashCache;
}

async function hashImageUrl(url) {
  try {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000 });
    return createHash('md5').update(Buffer.from(res.data)).digest('hex');
  } catch {
    return null;
  }
}

const IMAGE_TYPES = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

function imageAttachments(message) {
  return [...message.attachments.values()].filter(a => {
    const ext = a.name?.split('.').pop()?.toLowerCase();
    return IMAGE_TYPES.has(ext) || a.contentType?.startsWith('image/');
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

export const ScamDetectionService = {
  /** Returns true and removes the message if it matches scam text or a registered scam image. */
  async check(client, message) {
    if (!message.deletable) return false;

    const content = message.content ?? '';
    const embeds = message.embeds ?? [];
    const isGuild = !!message.guild;

    const textScam = isTextScam(content, embeds);
    let imageScam = false;

    const images = imageAttachments(message);
    if (images.length && client.db?.isAvailable?.()) {
      const hashes = await loadHashes(client.db);
      for (const img of images) {
        const hash = await hashImageUrl(img.url);
        if (hash && hashes.has(hash)) { imageScam = true; break; }
      }
    }

    if (!textScam && !imageScam) return false;

    try {
      await message.delete();
    } catch {
      // Can't delete (e.g. DM) — just warn
    }

    try {
      const warn = await message.channel.send({
        content: `🚨 <@${message.author.id}> A message was automatically removed for containing scam content.`,
      });
      if (isGuild) setTimeout(() => warn.delete().catch(() => {}), 8000);
    } catch {}

    return true;
  },

  /** Register all image attachments in a message as scam images. Returns count added. */
  async registerImages(client, message) {
    if (!client.db?.isAvailable?.()) return 0;

    const images = imageAttachments(message);
    if (!images.length) return 0;

    const hashes = await loadHashes(client.db);
    let added = 0;

    for (const img of images) {
      const hash = await hashImageUrl(img.url);
      if (hash && !hashes.has(hash)) {
        hashes.add(hash);
        added++;
      }
    }

    if (added) await client.db.set('scam:image-hashes', [...hashes]);
    return added;
  },

  /** Remove all image attachments in a message from the scam hash list. Returns count removed. */
  async unregisterImages(client, message) {
    if (!client.db?.isAvailable?.()) return 0;

    const images = imageAttachments(message);
    if (!images.length) return 0;

    const hashes = await loadHashes(client.db);
    let removed = 0;

    for (const img of images) {
      const hash = await hashImageUrl(img.url);
      if (hash && hashes.has(hash)) {
        hashes.delete(hash);
        removed++;
      }
    }

    if (removed) await client.db.set('scam:image-hashes', [...hashes]);
    return removed;
  },

  /** Wipe the in-memory cache (call after DB changes from another process). */
  clearCache() {
    _hashCache = null;
  },
};
