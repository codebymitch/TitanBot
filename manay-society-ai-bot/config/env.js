export function getEnv() {
  return {
    discordToken: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID || null,
    mongoUri: process.env.MONGODB_URI,
    openAiApiKey: process.env.OPENAI_API_KEY,
    defaultChatModel: process.env.OPENAI_CHAT_MODEL || 'gpt-4.1-mini',
    imageModel: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1-mini',
    defaultDailyLimit: positiveInt(process.env.DEFAULT_DAILY_LIMIT, 25, 1, 1000),
    defaultMaxHistory: positiveInt(process.env.DEFAULT_MAX_HISTORY, 16, 2, 60),
    cooldownMs: positiveInt(process.env.AI_COOLDOWN_MS, 3000, 0, 60000),
    openAiTimeoutMs: positiveInt(process.env.OPENAI_TIMEOUT_MS, 60000, 5000, 120000),
    maxPromptLength: positiveInt(process.env.MAX_PROMPT_LENGTH, 4000, 100, 20000),
    maxImagePromptLength: positiveInt(process.env.MAX_IMAGE_PROMPT_LENGTH, 1000, 50, 4000),
  };
}

export function assertRequiredEnv(env = getEnv()) {
  const missing = [];
  if (!env.discordToken) missing.push('DISCORD_TOKEN');
  if (!env.clientId) missing.push('CLIENT_ID');
  if (!env.mongoUri) missing.push('MONGODB_URI');
  if (!env.openAiApiKey) missing.push('OPENAI_API_KEY');

  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return env;
}

function positiveInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}
