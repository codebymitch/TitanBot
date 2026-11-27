// aiChatService.js — AI chat backend for the /ai feature.
//
// Talks to any OpenAI-compatible chat completions endpoint (OpenAI, Groq,
// OpenRouter, ...) and keeps a short per-channel conversation memory so the
// assistant can follow context inside the configured channel.

import axios from 'axios';
import { logger } from '../utils/logger.js';
import botConfig from '../config/bot.js';
import { getGuildConfig, setGuildConfig } from './config/guildConfig.js';
import { createError, ErrorTypes } from '../utils/errorHandler.js';

const DEFAULT_AI_CHAT = {
  enabled: false,
  channelId: null,
  systemPrompt: null,
  model: null,
};

const HISTORY_PREFIX = 'aiChat:history';
const MAX_COOLDOWN_ENTRIES = 5000;

const cooldowns = new Map();

export function getAiSettings() {
  return botConfig.ai || {};
}

/** Whether the bot has an API key configured for AI chat. */
export function isAiConfigured() {
  return Boolean(getAiSettings().apiKey);
}

export function getDefaultSystemPrompt() {
  return getAiSettings().defaultSystemPrompt || 'You are a helpful assistant.';
}

export function getDefaultModel() {
  return getAiSettings().model || 'gpt-4o-mini';
}

function normalizeAiChat(raw) {
  const base = raw && typeof raw === 'object' ? raw : {};

  const systemPrompt =
    typeof base.systemPrompt === 'string' && base.systemPrompt.trim().length > 0
      ? base.systemPrompt.trim()
      : null;

  const model =
    typeof base.model === 'string' && base.model.trim().length > 0
      ? base.model.trim()
      : null;

  return {
    ...DEFAULT_AI_CHAT,
    enabled: base.enabled === true,
    channelId: typeof base.channelId === 'string' && base.channelId ? base.channelId : null,
    systemPrompt,
    model,
  };
}

/** Read the normalized AI chat settings for a guild. */
export async function getAiChatConfig(client, guildId) {
  const config = await getGuildConfig(client, guildId);
  return normalizeAiChat(config.aiChat);
}

/** Merge a partial update into the guild's AI chat settings and persist it. */
export async function updateAiChatConfig(client, guildId, patch) {
  const config = await getGuildConfig(client, guildId);
  const next = normalizeAiChat({ ...normalizeAiChat(config.aiChat), ...patch });
  config.aiChat = next;
  await setGuildConfig(client, guildId, config);
  return next;
}

function getHistoryKey(guildId, channelId) {
  return `${HISTORY_PREFIX}:${guildId}:${channelId}`;
}

/** Load the stored conversation for a channel (oldest first). */
export async function getConversation(client, guildId, channelId) {
  try {
    const history = await client.db.get(getHistoryKey(guildId, channelId), []);
    return Array.isArray(history) ? history : [];
  } catch (error) {
    logger.error('Failed to load AI conversation history:', error);
    return [];
  }
}

/** Delete the stored conversation for a channel. */
export async function clearConversation(client, guildId, channelId) {
  await client.db.delete(getHistoryKey(guildId, channelId));
}

async function saveConversation(client, guildId, channelId, messages) {
  const historyLimit = Math.max(2, Number(getAiSettings().historyLimit) || 12);
  const trimmed = messages.slice(-historyLimit);
  await client.db.set(getHistoryKey(guildId, channelId), trimmed);
  return trimmed;
}

/**
 * Call the configured provider with a ready-made message list.
 * @throws {TitanBotError} when AI is not configured or the provider fails.
 */
export async function requestAiReply({ systemPrompt, messages, model }) {
  const settings = getAiSettings();

  if (!settings.apiKey) {
    throw createError(
      'AI API key is not configured',
      ErrorTypes.CONFIGURATION,
      'AI chat is not configured on this bot. Ask the bot owner to set the AI_API_KEY.',
      { errorCode: 'AI_NOT_CONFIGURED' },
    );
  }

  const baseUrl = String(settings.baseUrl || '').replace(/\/+$/, '');
  const url = `${baseUrl}/chat/completions`;

  const payload = {
    model: model || settings.model,
    messages: [
      { role: 'system', content: systemPrompt || getDefaultSystemPrompt() },
      ...messages,
    ],
    temperature: settings.temperature,
    max_tokens: settings.maxTokens,
  };

  try {
    const response = await axios.post(url, payload, {
      timeout: settings.requestTimeoutMs,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
    });

    const text = response?.data?.choices?.[0]?.message?.content;

    if (typeof text !== 'string' || text.trim().length === 0) {
      throw createError(
        'AI provider returned an empty response',
        ErrorTypes.NETWORK,
        'The AI did not return a reply. Please try again in a moment.',
        { errorCode: 'AI_EMPTY_RESPONSE' },
      );
    }

    return text.trim();
  } catch (error) {
    if (error?.type) {
      throw error;
    }

    const status = error?.response?.status;
    const providerMessage = error?.response?.data?.error?.message;

    logger.error('AI provider request failed:', {
      status,
      message: providerMessage || error.message,
    });

    if (status === 401 || status === 403) {
      throw createError(
        'AI provider rejected the API key',
        ErrorTypes.CONFIGURATION,
        'The AI provider rejected the bot API key. Ask the bot owner to check it.',
        { errorCode: 'AI_AUTH_FAILED', status },
      );
    }

    if (status === 429) {
      throw createError(
        'AI provider rate limited the request',
        ErrorTypes.RATE_LIMIT,
        'The AI is receiving too many requests right now. Please try again shortly.',
        { errorCode: 'AI_RATE_LIMITED', status },
      );
    }

    throw createError(
      'AI provider request failed',
      ErrorTypes.NETWORK,
      'I could not reach the AI service. Please try again in a moment.',
      { errorCode: 'AI_PROVIDER_ERROR', status },
    );
  }
}

/**
 * Generate a reply for a single prompt, optionally using and updating the
 * channel conversation memory.
 */
export async function generateReply(client, guildId, channelId, content, { useHistory = true } = {}) {
  const config = await getAiChatConfig(client, guildId);
  const systemPrompt = config.systemPrompt || getDefaultSystemPrompt();
  const model = config.model || getDefaultModel();

  const history = useHistory ? await getConversation(client, guildId, channelId) : [];
  const messages = [...history, { role: 'user', content }];

  const reply = await requestAiReply({ systemPrompt, messages, model });

  if (useHistory) {
    await saveConversation(client, guildId, channelId, [
      ...messages,
      { role: 'assistant', content: reply },
    ]);
  }

  return reply;
}

/**
 * Simple per-user cooldown check. Returns whether the caller may proceed and,
 * if not, the remaining time in milliseconds.
 */
export function checkCooldown(key) {
  const now = Date.now();
  const cooldownMs = Math.max(0, Number(getAiSettings().cooldownMs) || 0);

  if (cooldownMs <= 0) {
    return { allowed: true, retryAfterMs: 0 };
  }

  const expiresAt = cooldowns.get(key);
  if (expiresAt && now < expiresAt) {
    return { allowed: false, retryAfterMs: expiresAt - now };
  }

  if (cooldowns.size > MAX_COOLDOWN_ENTRIES) {
    for (const [entryKey, entryExpiry] of cooldowns) {
      if (entryExpiry <= now) {
        cooldowns.delete(entryKey);
      }
    }
  }

  cooldowns.set(key, now + cooldownMs);
  return { allowed: true, retryAfterMs: 0 };
}

/** Split a long reply into Discord-safe chunks (max 2000 characters each). */
export function splitMessage(text, limit = 2000) {
  const content = String(text ?? '');
  if (content.length <= limit) {
    return [content];
  }

  const chunks = [];
  let remaining = content;

  while (remaining.length > limit) {
    let splitAt = remaining.lastIndexOf('\n', limit);
    if (splitAt < limit * 0.5) {
      splitAt = remaining.lastIndexOf(' ', limit);
    }
    if (splitAt <= 0) {
      splitAt = limit;
    }

    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}
