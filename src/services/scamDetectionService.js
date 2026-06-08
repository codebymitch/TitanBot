// Detects and deletes crypto/gambling scam messages (fake giveaways, casino promos, etc.)

const SCAM_DOMAINS = [
  'cobratate', 'tatespeech', 'hustlersuniversity', 'cobracasino',
  'cryptofire', 'bit.ly', 'tinyurl', 'shorturl', 'cutt.ly',
  'stake.com', 'rollbit', 'duelbits', 'bc.game', 'roobet',
  'wolf.bet', 'gamdom', 'csgoroll', 'csgoempire', 'skinclub',
  'csgopolygon', 'clash.gg', 'thunderpick',
];

// Keyword combos — must match ≥2 from a group to trigger, or ≥1 from HIGH_CONFIDENCE
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

// Any single match here is enough to flag
const HIGH_CONFIDENCE = [
  'cobratate.com', 'tatespeech.com', 'cryptofire.io',
  'enter the promo code', 'use code launch', 'use code: launch',
  'airdrop is live', 'claim your airdrop',
  'send 1 btc get 2 btc', 'send 1 eth get 2 eth',
  'elon musk giveaway', 'verify your wallet',
  'connect your wallet to claim',
];

function containsScamDomain(text) {
  const lower = text.toLowerCase();
  return SCAM_DOMAINS.some(d => lower.includes(d));
}

function matchedKeywordGroups(text) {
  const lower = text.toLowerCase();
  let matched = 0;
  for (const group of KEYWORD_GROUPS) {
    if (group.some(kw => lower.includes(kw))) matched++;
  }
  return matched;
}

function isHighConfidence(text) {
  const lower = text.toLowerCase();
  return HIGH_CONFIDENCE.some(kw => lower.includes(kw));
}

function isScam(content, embeds = []) {
  const allText = [
    content,
    ...embeds.map(e => [e.title, e.description, e.url, ...(e.fields?.map(f => f.value) ?? [])].join(' ')),
  ].join(' ');

  if (isHighConfidence(allText)) return true;
  if (containsScamDomain(allText)) return true;
  if (matchedKeywordGroups(allText) >= 3) return true;

  return false;
}

export const ScamDetectionService = {
  async check(client, message) {
    if (!message.guild) return false;
    if (!message.deletable) return false;

    const content = message.content ?? '';
    const embeds = message.embeds ?? [];

    if (!isScam(content, embeds)) return false;

    try {
      await message.delete();

      const channel = message.channel;
      const warn = await channel.send({
        content: `🚨 <@${message.author.id}> A message was automatically removed for containing scam/gambling content.`,
      });
      setTimeout(() => warn.delete().catch(() => {}), 8000);

      return true;
    } catch {
      return false;
    }
  },
};
