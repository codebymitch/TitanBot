// Dispatch + scene management for GTA V RP
import { aiConfig } from '../config/ai.js';
import { chat, classifyIntent } from './aiService.js';
import { logger } from '../utils/logger.js';

const DISPATCH_PROMPT = `You are T MO, LSPD/BCSO dispatch for a GTA V roleplay car club.
Respond like a real police dispatcher: use ten-codes (10-4, 10-20, Code 3),
give a believable Los Santos or Blaine County location, assign a unit, keep it 1-3 sentences.
End with a status line like "Units en route" or "Copy, stand by." Stay in character. Never mention you are AI.`;

const SCENE_PROMPT = `You are T MO, scene director for a GTA V roleplay car club.
Set the scene in 2-4 sentences with sensory detail (engine sounds, neon, weather, smells of Los Santos).
End with ONE question that pushes the scene forward. Stay in character. Never mention you are AI.`;

const CHAT_PROMPT = `You are T MO, the AI for a GTA V console RP car club. Street-smart, brief (1-2 sentences),
always in character in the GTA V world. Never mention you are AI.`;

// Returns true if this message should trigger T MO
export function shouldRespond(message, client) {
  if (!aiConfig.enabled) return false;
  if (message.author.bot || !message.guild) return false;
  if (!message.content) return false;
  const mentioned = message.mentions.has(client.user);
  const nameHit = message.content.toLowerCase().includes(aiConfig.triggerWord);
  return mentioned || nameHit;
}

function cleanText(message, client) {
  return message.content
    .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
    .replace(new RegExp(`\\b${aiConfig.triggerWord}\\b`, 'gi'), '')
    .trim();
}

export async function handleMessage(message, client) {
  const text = cleanText(message, client);
  if (!text) return;

  try {
    await message.channel.sendTyping().catch(() => {});
    const intent = await classifyIntent(text);
    logger.info(`T MO intent=${intent} | ${message.author.username}: ${text.slice(0, 80)}`);

    let prompt = CHAT_PROMPT;
    let prefix = '';
    if (intent === 'dispatch') { prompt = DISPATCH_PROMPT; prefix = '📻 **Dispatch** — '; }
    else if (intent === 'scene') { prompt = SCENE_PROMPT; prefix = '🎬 '; }

    const reply = await chat(prompt, text);
    if (reply) await message.reply(`${prefix}${reply}`);
  } catch (err) {
    logger.error('dispatchService error:', err);
  }
}

export default { shouldRespond, handleMessage };
