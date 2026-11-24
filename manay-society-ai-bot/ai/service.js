import { Conversation } from '../models/Conversation.js';
import { consumeUsage } from '../database/settings.js';
import { getEnv } from '../config/env.js';
import { buildSystemPrompt } from './prompts.js';
import { getOpenAI } from './client.js';

const cooldowns = new Map();
const queues = new Map();

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

export async function generateChatResponse({ guildId, userId, prompt, config }) {
  const env = getEnv();
  const text = String(prompt || '').trim();
  if (!text) throw new Error('Please enter a message.');
  if (text.length > env.maxPromptLength) {
    throw new Error(`Message is too long. The maximum is ${env.maxPromptLength} characters.`);
  }

  return enqueueConversation(`${guildId}:${userId}`, async () => {
    await consumeUsage(guildId, userId, config.dailyLimit);

    const conversation = config.memoryEnabled
      ? await Conversation.findOne({ guildId, userId }).lean()
      : null;
    const history = Array.isArray(conversation?.messages)
      ? trimHistory(conversation.messages, config.maxHistory)
      : [];
    const messages = [
      { role: 'system', content: buildSystemPrompt(config) },
      ...history.slice(-(config.maxHistory * 2)).map(({ role, content }) => ({ role, content })),
      { role: 'user', content: text },
    ];

    const completion = await getOpenAI().chat.completions.create({
      model: config.model || env.defaultChatModel,
      messages,
      max_completion_tokens: 1200,
      temperature: 0.7,
    });

    const response = extractText(completion.choices?.[0]?.message?.content);
    if (!response) throw new Error('OpenAI returned an empty chat response.');

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

  if (guildId && userId && config) {
    await consumeUsage(guildId, userId, config.dailyLimit);
  }

  const result = await getOpenAI().images.generate({
    model: env.imageModel,
    prompt: text,
    size: '1024x1024',
    n: 1,
  });

  const image = result.data?.[0];
  if (image?.b64_json) {
    const data = Buffer.from(image.b64_json, 'base64');
    if (data.length > 8 * 1024 * 1024) throw new Error('Generated image is too large to upload to Discord.');
    return data;
  }
  if (image?.url) {
    const response = await fetch(image.url);
    if (!response.ok) throw new Error(`Could not download generated image (HTTP ${response.status}).`);
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > 8 * 1024 * 1024) throw new Error('Generated image is too large to upload to Discord.');
    return data;
  }

  throw new Error('OpenAI returned no image data.');
}

export function formatAiError(error) {
  if (error?.code === 'AI_DAILY_LIMIT') {
    return 'Kamu sudah mencapai batas penggunaan AI hari ini. Coba lagi besok ya.';
  }
  if (error?.status === 429) {
    return 'OpenAI lagi membatasi request atau kuota API habis. Coba beberapa saat lagi.';
  }
  if (error?.status === 401 || error?.status === 403) {
    return 'OpenAI API key tidak valid atau tidak punya akses. Minta admin cek konfigurasi.';
  }
  if (error?.status >= 500 || error?.name === 'APIConnectionTimeoutError') {
    return 'Layanan AI sedang bermasalah atau timeout. Coba lagi sebentar.';
  }
  return error?.message || 'Terjadi error saat memproses permintaan AI.';
}
