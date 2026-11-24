const PERSONALITIES = {
  friendly: 'Be warm, empathetic, and easy to talk to.',
  professional: 'Be clear, respectful, accurate, and professional.',
  funny: 'Be playful and witty when appropriate, but never let jokes obscure the answer.',
  custom: '',
};

export function buildSystemPrompt(config) {
  const personality = PERSONALITIES[config.personality] || PERSONALITIES.friendly;
  const customPrompt = config.personality === 'custom'
    ? String(config.customSystemPrompt || '').trim()
    : '';

  return [
    'You are Manay Society, a helpful Discord AI assistant.',
    'Reply in the same language as the user (Indonesian or English).',
    personality,
    customPrompt,
    'Answer the user directly. For casual messages, keep the reply concise; expand when the user asks for detail.',
    'Do not invent facts. If a message is ambiguous, ask one short clarifying question instead of guessing.',
    'Use Markdown only when it makes the answer easier to read.',
  ].filter(Boolean).join('\n');
}

export const PERSONALITY_CHOICES = [
  { name: 'Friendly', value: 'friendly' },
  { name: 'Professional', value: 'professional' },
  { name: 'Funny', value: 'funny' },
  { name: 'Custom', value: 'custom' },
];

export const MODEL_CHOICES = [
  { name: 'GPT-4.1 mini (recommended)', value: 'gpt-4.1-mini' },
  { name: 'GPT-4.1', value: 'gpt-4.1' },
  { name: 'GPT-4o mini', value: 'gpt-4o-mini' },
  { name: 'GPT-4o', value: 'gpt-4o' },
];
