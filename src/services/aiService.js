// Minimal OpenAI client using built-in fetch. No new dependencies.
import { aiConfig } from '../config/ai.js';
import { logger } from '../utils/logger.js';

export async function chat(systemPrompt, userMessage) {
  if (!aiConfig.apiKey) {
    logger.warn('OPENAI_API_KEY not set');
    return null;
  }
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: aiConfig.model,
        temperature: aiConfig.temperature,
        max_tokens: aiConfig.maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      }),
    });
    if (!res.ok) {
      logger.error(`OpenAI ${res.status}: ${await res.text()}`);
      return null;
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    logger.error('aiService.chat error:', err.message);
    return null;
  }
}

export async function classifyIntent(text) {
  if (!aiConfig.apiKey) return 'chat';
  const system = `Classify the message into ONE word only: "dispatch", "scene", or "chat".
- dispatch: calling police/EMS, reporting crime, requesting backup, 911
- scene: setting up roleplay scene, narration, describing a location
- chat: anything else`;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: aiConfig.model,
        temperature: 0,
        max_tokens: 5,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: text },
        ],
      }),
    });
    if (!res.ok) return 'chat';
    const data = await res.json();
    const out = data.choices?.[0]?.message?.content?.toLowerCase().trim() || 'chat';
    if (out.includes('dispatch')) return 'dispatch';
    if (out.includes('scene')) return 'scene';
    return 'chat';
  } catch {
    return 'chat';
  }
}

export default { chat, classifyIntent };
