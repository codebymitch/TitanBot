// Dispatch + scene management for GTA V RP
import { aiConfig } from '../config/ai.js';
import { chat, classifyIntent } from './aiService.js';
import { logger } from '../utils/logger.js';

const DISPATCH_PROMPT = `You are T MO, LSPD/BCSO dispatch for a GTA V roleplay car club.
Respond like a real police dispatcher. Use ten-codes (10-4, 10-20, Code 3, 10-50, 10-15).
Give a believable Los Santos or Blaine County location, assign a unit, keep it 1-3 sentences.
End with a status line like "Units en route" or "Copy, stand by."

You MUST also call in narcotics activity when reported. Use proper codes:
- 11-550 = narcotics activity / drug deal in progress
- 10-50 = traffic / possible deal at vehicle
- Code 6 = stand by, suspect on scene
Drug callouts: weed (11-357), meth (11-590), cocaine (11-550C).
Locations to use for drug calls: Grove Street, Strawberry, Sandy Shores trailer park,
Davis projects, Vinewood back alleys, Vespucci canals, Paleto Bay docks, Cypress Flats.

Stay in character. Never mention you are AI.`;

const SCENE_PROMPT = `You are T MO, scene director for a GTA V roleplay car club.
Set the scene in 2-4 sentences with sensory detail (engine sounds, neon, weather, smells of Los Santos).
End with ONE question that pushes the scene forward. Stay in character. Never mention you are AI.`;

const CHAT_PROMPT = `You are T MO, the AI for a GTA V console RP car club. Street-smart, brief (1-2 sentences),
always in character in the GTA V world. Never mention you are AI.`;

// Keywords that should auto-trigger a dispatch broadcast from RP chat → dispatch channel
const DRUG_KEYWORDS = [
  'weed', 'kush', 'blunt', 'ounce', 'oz',
  'coke', 'cocaine', 'kilo', 'brick', 'snow',
  'meth', 'crystal', 'tweak', 'shards',
  'deal', 'dealing', 'plug', 'dope', 'narcotics', 'drug'
];

export function looksLikeDrugDeal(text) {
  const t = text.toLowerCase();
  return DRUG_KEYWORDS.some(k => new RegExp(`\\b${k}\\b`, 'i').test(t));
}

// Decide if T MO should respond based on channel + trigger
export function shouldRespond(message, client) {
  if (!aiConfig.enabled) return false;
  if (message.author.bot || !message.guild) return false;
  if (!message.content) return false;

  const channelId = message.channel.id;
  const isRpChannel = channelId === aiConfig.rpChannelId;
  const isDispatchChannel = channelId === aiConfig.dispatchChannelId;
  if (!isRpChannel && !isDispatchChannel) return false;

  // In RP/dispatch channels, every message triggers T MO (no @mention needed)
  return true;
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

  const channelId = message.channel.id;
  const isDispatchChannel = channelId === aiConfig.dispatchChannelId;

  try {
    await message.channel.sendTyping().catch(() => {});

    let prompt, prefix;
    if (isDispatchChannel) {
      // Dispatch channel: ALWAYS dispatch mode. No intent classification needed (saves $).
      prompt = DISPATCH_PROMPT;
      prefix = '📻 **Dispatch** — ';
    } else {
      // RP channel: classify between scene vs chat
      const intent = await classifyIntent(text);
      logger.info(`T MO intent=${intent} | ${message.author.username}: ${text.slice(0, 80)}`);
      if (intent === 'scene') { prompt = SCENE_PROMPT; prefix = '🎬 '; }
      else { prompt = CHAT_PROMPT; prefix = ''; }

      // Bonus: if a drug deal is mentioned in RP chat, also broadcast to dispatch channel
      if (looksLikeDrugDeal(text) && aiConfig.dispatchChannelId) {
        broadcastDispatch(client, text, message.author.username).catch(err =>
          logger.error('broadcastDispatch error:', err.message)
        );
      }
    }

    const reply = await chat(prompt, text);
    if (reply) await message.reply(`${prefix}${reply}`);
  } catch (err) {
    logger.error('dispatchService error:', err);
  }
}

async function broadcastDispatch(client, rpText, username) {
  const dispatchChannel = await client.channels.fetch(aiConfig.dispatchChannelId).catch(() => null);
  if (!dispatchChannel) return;
  const callout = await chat(
    DISPATCH_PROMPT,
    `Anonymous tip just came in about possible narcotics activity. Tipster overheard: "${rpText}". Issue the narcotics call now.`
  );
  if (callout) {
    await dispatchChannel.send(`🚨 **Narcotics Tip** — ${callout}`).catch(() => {});
    logger.info(`Drug-deal callout broadcast to dispatch from ${username}`);
  }
}

export default { shouldRespond, handleMessage };
