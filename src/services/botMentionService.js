// botMentionService.js — what the bot does when someone pings it.
//
//  * Only STAFF pings get a reply. Everyone else is ignored silently.
//  * Bare ping (no question)  -> "I'm Strommc bot, how can I help you today?"
//  * Ping + question          -> the answer from Gemini.
//
// Nothing here locks, mutes or restricts the channel. The Gemini call runs in the
// background, so it never delays other messages or the normal chat flow.

import { PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';
import { isBotOwner } from '../config/bot.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import {
  askGemini,
  getBotDisplayName,
  isGeminiConfigured,
  splitForDiscord,
} from './geminiService.js';

const AI_RATE_LIMIT_ATTEMPTS = 5;
const AI_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REPLY_CHUNKS = 3;

// A member is "staff" if they have any moderation permission, are a bot owner,
// or hold a role listed in STAFF_ROLE_IDS (comma-separated role IDs in .env).
const STAFF_PERMISSIONS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
];

function getStaffRoleIds() {
  return (process.env.STAFF_ROLE_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isStaffMember(member, userId) {
  if (isBotOwner(userId)) {
    return true;
  }
  if (!member) {
    return false;
  }
  if (STAFF_PERMISSIONS.some((permission) => member.permissions.has(permission))) {
    return true;
  }
  const staffRoleIds = getStaffRoleIds();
  return staffRoleIds.length > 0 && member.roles.cache.some((role) => staffRoleIds.includes(role.id));
}

function stripBotMention(content, botId) {
  return String(content ?? '')
    .replace(new RegExp(`<@!?${botId}>`, 'g'), '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Replies must never ping anyone (the AI could output <@id>, @everyone, etc.).
const SAFE_MENTIONS = { parse: [], repliedUser: false };

async function answerQuestion(message, question) {
  try {
    await message.channel.sendTyping().catch(() => {});

    const answer = await askGemini(question);
    const chunks = splitForDiscord(answer).slice(0, MAX_REPLY_CHUNKS);

    let first = true;
    for (const chunk of chunks) {
      if (first) {
        await message.reply({ content: chunk, allowedMentions: SAFE_MENTIONS });
        first = false;
      } else {
        await message.channel.send({ content: chunk, allowedMentions: SAFE_MENTIONS });
      }
    }
  } catch (error) {
    const userMessage = error?.userMessage || 'Something went wrong while answering. Please try again.';
    if (!error?.userMessage) {
      logger.error('Unexpected error while answering a bot mention:', error);
    }
    await message
      .reply({ content: userMessage, allowedMentions: SAFE_MENTIONS })
      .catch(() => {});
  }
}

/**
 * Returns true when the message was a ping to the bot (handled or intentionally
 * ignored), so the caller can skip prefix-command parsing for it.
 * Returns quickly; any slow work (the Gemini call) continues in the background.
 */
export async function handleBotMention(message, client) {
  const botId = client.user?.id;
  if (!botId || !message.guild) {
    return false;
  }

  const pinged = message.mentions.has(botId, {
    ignoreEveryone: true,
    ignoreRoles: true,
    ignoreRepliedUser: false,
  });
  if (!pinged) {
    return false;
  }

  const member = message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!isStaffMember(member, message.author.id)) {
    return true; // non-staff ping: stay silent
  }

  const question = stripBotMention(message.content, botId);

  if (!question) {
    await message
      .reply({
        content: `I'm ${getBotDisplayName()}, how can I help you today?`,
        allowedMentions: SAFE_MENTIONS,
      })
      .catch((error) => logger.warn('Failed to send mention greeting:', error?.message));
    return true;
  }

  if (!isGeminiConfigured()) {
    await message
      .reply({
        content: `I'm ${getBotDisplayName()}. The AI is not set up yet — the bot owner needs to add a Gemini API key.`,
        allowedMentions: SAFE_MENTIONS,
      })
      .catch(() => {});
    return true;
  }

  const allowed = await checkRateLimit(
    `ai:${message.guild.id}:${message.author.id}`,
    AI_RATE_LIMIT_ATTEMPTS,
    AI_RATE_LIMIT_WINDOW_MS,
  );
  if (!allowed) {
    await message
      .reply({
        content: 'You are asking too fast. Please wait a minute and try again.',
        allowedMentions: SAFE_MENTIONS,
      })
      .catch(() => {});
    return true;
  }

  // Fire and forget: the channel stays free while Gemini is thinking.
  void answerQuestion(message, question);
  return true;
}
