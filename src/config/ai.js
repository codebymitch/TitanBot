// AI dispatch/scene settings + channel locks
export const aiConfig = {
  enabled: process.env.AI_ENABLED !== 'false',
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  triggerWord: (process.env.AI_TRIGGER_WORD || 'tmo').toLowerCase(),
  maxTokens: 200,
  temperature: 0.8,

  // Channel locks — T MO AI only responds in these channels.
  // Slash commands are locked separately via commandsChannelId.
  rpChannelId: process.env.AI_RP_CHANNEL_ID || '1508536082038390945',
  dispatchChannelId: process.env.AI_DISPATCH_CHANNEL_ID || '1508529364994883654',
  commandsChannelId: process.env.COMMANDS_CHANNEL_ID || '1508530649957400606',
};

export default aiConfig;
