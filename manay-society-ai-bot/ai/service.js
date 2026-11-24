import { Conversation } from '../models/Conversation.js';
import { consumeUsage } from '../database/settings.js';
import { getEnv } from '../config/env.js';
import { buildSystemPrompt } from './prompts.js';
import { requestChatCompletion, requestImage } from './client.js';

const cooldowns = new Map();
const queues = new Map();
const freeRequestQueues = new Map();
const nextFreeRequestAt = { text: 0, image: 0 };
const freeRequestDepth = { text: 0, image: 0 };

export function isChannelAllowed(config, channelId) {
  if (!config.enabled) return false;
  if (config.allChannels) return !config.disabledChannelIds.includes(channelId);
  return config.channelIds.includes(channelId);
}

export function checkCooldown(guildId, userId) {
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const until = cooldowns.get(key) || 0;
  if (until > now) return until - now;

  const env = getEnv();
  cooldowns.set(key, now + env.cooldownMs);
  if (cooldowns.size > 5000) {
    for (const [entry, expiry] of cooldowns) {
      if (expiry <= now) cooldowns.delete(entry);
    }
  }
  return 0;
}

function enqueueConversation(key, task) {
  const previous = queues.get(key) || Promise.resolve();
  const current = previous.then(task, task);
  const tracked = current.catch(() => {});
  queues.set(key, tracked);
  current.then(
    () => {
      if (queues.get(key) === tracked) queues.delete(key);
    },
    () => {
      if (queues.get(key) === tracked) queues.delete(key);
    },
  );
  return current;
}

function enqueueFreeRequest(kind, task) {
  if (freeRequestDepth[kind] >= 12) {
    const error = new Error('The free AI request queue is full.');
    error.code = 'AI_QUEUE_FULL';
    throw error;
  }

  freeRequestDepth[kind] += 1;
  const previous = freeRequestQueues.get(kind) || Promise.resolve();
  const current = previous.then(async () => {
    const env = getEnv();
    const waitMs = Math.max(0, nextFreeRequestAt[kind] - Date.now());
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));

    const interval = kind === 'image' ? env.freeImageIntervalMs : env.freeTextIntervalMs;
    nextFreeRequestAt[kind] = Date.now() + interval;
    try {
      return await task();
    } catch (error) {
      if (error?.retryAfterSeconds) {
        nextFreeRequestAt[kind] = Math.max(
          nextFreeRequestAt[kind],
          Date.now() + error.retryAfterSeconds * 1000,
        );
      }
      throw error;
    }
  });

  const tracked = current.catch(() => {});
  freeRequestQueues.set(kind, tracked);
  current.then(
    () => {
      freeRequestDepth[kind] = Math.max(0, freeRequestDepth[kind] - 1);
      if (freeRequestQueues.get(kind) === tracked) freeRequestQueues.delete(kind);
    },
    () => {
      freeRequestDepth[kind] = Math.max(0, freeRequestDepth[kind] - 1);
      if (freeRequestQueues.get(kind) === tracked) freeRequestQueues.delete(kind);
    },
  );
  return current;
}

export async function generateChatResponse({ guildId, userId, prompt, config }) {
  const env = getEnv();
  const text = String(prompt || '').trim();
  if (!text) throw new Error('Please enter a message.');
  if (text.length > env.maxPromptLength) {
    throw new Error(`Message is too long. The maximum is ${env.maxPromptLength} characters.`);
  }

  return enqueueConversation(`${guildId}:${userId}`, async () => {
    const conversation = config.memoryEnabled
      ? await Conversation.findOne({ guildId, userId }).lean()
      : null;
    const history = Array.isArray(conversation?.messages)
      ? trimHistory(conversation.messages, config.maxHistory)
      : [];
    const messages = [
      { role: 'system', content: buildSystemPrompt(config) },
      ...history.map(({ role, content }) => ({ role, content })),
      { role: 'user', content: text },
    ];

    const completion = await enqueueFreeRequest(
      'text',
      async () => {
        await consumeUsage(guildId, userId, config.dailyLimit);
        return requestChatCompletion({
          model: config.model === 'openai-fast' ? config.model : env.defaultChatModel,
          messages,
        });
      },
    );

    const response = extractText(completion.choices?.[0]?.message?.content);
    if (!response) throw new Error('Free AI service returned an empty chat response.');

    if (config.memoryEnabled) {
      const updatedMessages = [
        ...history,
        { role: 'user', content: text },
        { role: 'assistant', content: response },
      ].slice(-config.maxHistory);

      await Conversation.findOneAndUpdate(
        { guildId, userId },
        { $set: { messages: updatedMessages }, $setOnInsert: { guildId, userId } },
        { upsert: true, new: true, runValidators: true },
      );
    }

    return response;
  });
}

function extractText(content) {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim();
}

function trimHistory(messages, maxMessages) {
  let remaining = 24000;
  const bounded = [];
  for (const message of messages.slice(-maxMessages).reverse()) {
    if (remaining <= 0) break;
    const content = String(message.content || '');
    const text = content.slice(-remaining);
    bounded.unshift({ role: message.role, content: text });
    remaining -= text.length;
  }
  return bounded;
}

export async function clearUserMemory(guildId, userId) {
  await Conversation.deleteOne({ guildId, userId });
}

export async function generateImage(prompt, { guildId, userId, config } = {}) {
  const env = getEnv();
  const text = String(prompt || '').trim();
  if (!text) throw new Error('Please enter an image prompt.');
  if (text.length > env.maxImagePromptLength) {
    throw new Error(`Prompt is too long. The maximum is ${env.maxImagePromptLength} characters.`);
  }

  return enqueueFreeRequest('image', async () => {
    if (guildId && userId && config) {
      await consumeUsage(guildId, userId, config.dailyLimit);
    }
    return requestImage(text);
  });
}

export function formatAiError(error) {
  if (error?.code === 'AI_DAILY_LIMIT') {
    return 'Kamu sudah mencapai batas penggunaan AI hari ini. Coba lagi besok ya.';
  }
  if (error?.code === 'AI_QUEUE_FULL') {
    return 'Antrean AI gratis sedang penuh. Coba kirim lagi beberapa saat ya.';
  }
  if (error?.status === 402) {
    const wait = error.retryAfterSeconds
      ? ` Coba lagi sekitar ${error.retryAfterSeconds} detik lagi.`
      : ' Coba lagi setelah cooldown sebentar.';
    return `Kuota gratis AI sedang cooldown.${wait}`;
  }
  if (error?.status === 429) {
    return 'Layanan AI gratis sedang membatasi request. Coba lagi sebentar.';
  }
  if (error?.status >= 500 || error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return 'Layanan AI sedang bermasalah atau timeout. Coba lagi sebentar.';
  }
  return error?.message || 'Terjadi error saat memproses permintaan AI.';
}
