// AI dispatch/scene settings
export const aiConfig = {
  enabled: process.env.AI_ENABLED !== 'false',
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  triggerWord: (process.env.AI_TRIGGER_WORD || 'tmo').toLowerCase(),
  maxTokens: 200,
  temperature: 0.8,
};

export default aiConfig;
