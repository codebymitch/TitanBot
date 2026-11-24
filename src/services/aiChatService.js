// aiChatService.js — AI Chat Assistant.
//
// Menangani: kepribadian AI, memori percakapan per-user (tersimpan di database),
// pemanggilan API AI (OpenAI-compatible Chat Completions), cooldown, queue
// per-user, dan error handling (timeout / rate limit / API error / respons kosong).

import axios from 'axios';
import { logger } from '../utils/logger.js';
import { getFromDb, setInDb, deleteFromDb } from '../utils/database.js';
import { getGuildConfig, setGuildConfig } from './config/guildConfig.js';
import { createError, ErrorTypes, TitanBotError } from '../utils/errorHandler.js';

// =========================
// KONFIGURASI PROVIDER (dari environment variables)
// =========================

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function clampFloat(value, fallback, min, max) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

export function getProviderConfig() {
  return {
    // AI_API_KEY wajib diisi lewat environment variable — jangan pernah hardcode.
    apiKey: process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '',
    baseUrl: (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: process.env.AI_MODEL || 'gpt-4o-mini',
    timeout: clampInt(process.env.AI_TIMEOUT_MS, 30000, 5000, 120000),
    // Leave room for reasoning models to produce a visible answer; prompt enforces brevity.
    maxTokens: clampInt(process.env.AI_MAX_TOKENS, 512, 50, 4096),
    temperature: clampFloat(process.env.AI_TEMPERATURE, 0.7, 0, 2),
    maxHistory: clampInt(process.env.AI_MAX_HISTORY, 16, 2, 60),
    cooldownMs: clampInt(process.env.AI_COOLDOWN_MS, 3000, 0, 60000),
  };
}

export function isAiConfigured() {
  return Boolean(getProviderConfig().apiKey);
}

// =========================
// KEPRIBADIAN AI (system prompt)
// =========================

function buildSystemPrompt(displayName) {
  const aiName = process.env.AI_NAME || 'Nayla';

  const lines = [
    `Kamu adalah "${aiName}", teman ngobrol di server Discord. Balas seperti orang biasa, bukan customer service atau robot.`,
    '',
    'Aturan ngobrol:',
    '- Pakai bahasa Indonesia santai dan ikuti gaya user. "Gw/lu/wkwk" boleh kalau terasa natural, jangan dipaksakan.',
    '- Langsung tanggapi isi pesan. Jangan selalu membuka dengan "Oii", sapaan, permintaan maaf, atau kalimat template.',
    '- Untuk chat biasa, jokes, atau slang: jawab singkat, biasanya satu kalimat dan maksimal sekitar 35 kata.',
    '- Jangan bikin paragraf panjang, daftar, atau penjelasan meta kecuali user memang minta penjelasan.',
    '- Pahami kata sesuai konteks paling wajar. Jangan mengarang kepanjangan, arti tersembunyi, asal-usul nama, atau cerita tentang orang.',
    '- Kalau maksud pesan benar-benar tidak jelas, tanya satu hal singkat. Jangan menebak-nebak atau memberi beberapa tafsir yang dibuat-buat.',
    '- Jangan mengulang pertanyaan user, jangan menawarkan menu bantuan yang tidak diminta, dan jangan memakai jokes yang sama terus.',
    '- Boleh bercanda tipis, tapi jangan menghina. Kalau user curhat atau topiknya serius, tanggapi dengan empati dan serius.',
    '- Untuk coding/troubleshooting atau pertanyaan yang memang butuh detail, beri langkah jelas secukupnya; tetap jangan bertele-tele.',
    '- Kalau tidak tahu, bilang tidak tahu dengan santai. Jangan mengarang fakta.',
    '- Jangan pernah menyebut diri sebagai AI/model bahasa. Format Discord seperlunya dan jangan spam emoji.',
    '',
    'Contoh: kalau user bertanya "Dirman anak siapa?", jawab seperti "Mana gw tau wkwk, Dirman yang mana?" Jangan mengarang identitas atau arti lain dari kata "Dirman".',
  ];

  if (displayName) {
    lines.push('', `Lawan bicaramu sekarang namanya "${displayName}".`);
  }

  return lines.join('\n');
}

// =========================
// MEMORI PERCAKAPAN (per-user, tersimpan permanen di database)
// =========================

function getHistoryKey(guildId, userId) {
  return `guild:${guildId}:ai:history:${userId}`;
}

function isValidHistoryEntry(entry) {
  return entry
    && typeof entry === 'object'
    && (entry.role === 'user' || entry.role === 'assistant')
    && typeof entry.content === 'string'
    && entry.content.trim().length > 0;
}

export async function getHistory(guildId, userId) {
  try {
    const raw = await getFromDb(getHistoryKey(guildId, userId), []);
    return Array.isArray(raw) ? raw.filter(isValidHistoryEntry) : [];
  } catch (error) {
    logger.error('Gagal memuat riwayat AI:', { guildId, userId, error: error?.message });
    return [];
  }
}

async function saveHistory(guildId, userId, messages) {
  await setInDb(getHistoryKey(guildId, userId), messages);
}

export async function clearHistory(guildId, userId) {
  await deleteFromDb(getHistoryKey(guildId, userId));
}

// =========================
// CHANNEL AI AUTO CHAT (per-server, disimpan di guild config)
// =========================

export async function getAiChannelConfig(client, guildId) {
  const config = await getGuildConfig(client, guildId);
  const ai = config?.ai && typeof config.ai === 'object' ? config.ai : {};
  const channelId = ai.channelId || null;

  return {
    enabled: ai.enabled === true && Boolean(channelId),
    channelId,
  };
}

export async function setAiChannel(client, guildId, channelId) {
  const config = await getGuildConfig(client, guildId);
  config.ai = { ...(config.ai || {}), channelId, enabled: true };
  await setGuildConfig(client, guildId, config);
  return config.ai;
}

export async function clearAiChannel(client, guildId) {
  const config = await getGuildConfig(client, guildId);
  config.ai = { ...(config.ai || {}), channelId: null, enabled: false };
  await setGuildConfig(client, guildId, config);
  return config.ai;
}

// =========================
// COOLDOWN & QUEUE (mencegah spam / request numpuk)
// =========================

const cooldowns = new Map(); // `${guildId}:${userId}` -> expiresAt
const queues = new Map();    // `${guildId}:${userId}` -> tail promise

export function getCooldownRemaining(guildId, userId) {
  const expiresAt = cooldowns.get(`${guildId}:${userId}`) || 0;
  const remaining = expiresAt - Date.now();
  return remaining > 0 ? remaining : 0;
}

export function markCooldown(guildId, userId) {
  const { cooldownMs } = getProviderConfig();
  if (cooldownMs <= 0) return;

  const key = `${guildId}:${userId}`;
  cooldowns.set(key, Date.now() + cooldownMs);

  // Bersihin entri yang sudah kedaluwarsa biar map nggak membengkak.
  if (cooldowns.size > 5000) {
    const now = Date.now();
    for (const [entryKey, expiresAt] of cooldowns) {
      if (expiresAt <= now) cooldowns.delete(entryKey);
    }
  }
}

/**
 * Jalankan task secara berurutan untuk user yang sama (guild+user).
 * Percakapan antar-user tetap jalan paralel; request satu user tidak saling tabrakan.
 */
export function enqueue(guildId, userId, task) {
  const key = `${guildId}:${userId}`;
  const previous = queues.get(key) || Promise.resolve();
  const next = previous.then(() => task(), () => task());
  queues.set(key, next.catch(() => {}));
  return next;
}

// =========================
// PEMANGGILAN API
// =========================

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function retryDelayMs(attempt, status, headers) {
  if (status === 429 && headers?.['retry-after']) {
    const seconds = Number.parseFloat(headers['retry-after']);
    if (Number.isFinite(seconds)) {
      return Math.min(seconds * 1000, 15000);
    }
  }
  return Math.min(500 * 2 ** (attempt - 1), 5000);
}

function extractCompletionText(responseData) {
  const content = responseData?.choices?.[0]?.message?.content;

  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (typeof part?.text === 'string') return part.text;
        return '';
      })
      .join('')
      .trim();
  }

  return '';
}

/**
 * Kirim chat completion ke provider OpenAI-compatible.
 * Mengembalikan teks balasan, atau melempar TitanBotError yang sudah bertipe.
 */
async function requestCompletion(cfg, messages) {
  const url = `${cfg.baseUrl}/chat/completions`;
  const body = {
    model: cfg.model,
    messages,
    temperature: cfg.temperature,
    max_tokens: cfg.maxTokens,
  };

  const maxAttempts = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let retryable = true;
    let response = null;

    try {
      response = await axios.post(url, body, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        timeout: cfg.timeout,
        validateStatus: () => true,
      });
    } catch (error) {
      if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
        lastError = createError('AI request timed out', ErrorTypes.NETWORK, null, { expected: true });
      } else {
        lastError = createError(`AI request failed: ${error?.message}`, ErrorTypes.NETWORK, null, { expected: true });
      }
    }

    if (response) {
      const status = response.status;

      if (status === 401 || status === 403) {
        lastError = createError(
          `AI provider rejected the API key (HTTP ${status})`,
          ErrorTypes.CONFIGURATION,
          'API key AI-nya kayaknya salah/nggak valid. Kasih tau admin buat cek **AI_API_KEY** ya 🙏',
          { expected: true },
        );
        retryable = false;
      } else if (status === 429) {
        lastError = createError(
          'AI provider rate limited the request',
          ErrorTypes.RATE_LIMIT,
          'Waduh lagi rame banget nih, AI-nya kena limit 😅 coba lagi bentar ya.',
          { expected: true },
        );
      } else if (status >= 500) {
        lastError = createError(
          `AI provider server error (HTTP ${status})`,
          ErrorTypes.NETWORK,
          'Server AI-nya lagi ngadat 🥲 coba lagi sebentar lagi ya.',
          { expected: true },
        );
      } else if (status >= 400) {
        lastError = createError(
          `AI provider rejected the request (HTTP ${status}): ${response.data?.error?.message || 'unknown'}`,
          ErrorTypes.NETWORK,
          'Ada masalah pas nyambung ke AI-nya. Coba lagi nanti ya.',
          { expected: true },
        );
        retryable = false;
      } else {
        const choice = response.data?.choices?.[0];
        const content = extractCompletionText(response.data);
        if (content) {
          return content;
        }
        lastError = createError(
          `AI provider returned an empty response (model=${cfg.model}, finish_reason=${choice?.finish_reason || 'unknown'}, response_id=${response.data?.id || 'unknown'})`,
          ErrorTypes.NETWORK,
          'Model AI-nya belum ngasih teks jawaban. Coba sekali lagi ya; kalau terus begitu, admin perlu cek model atau batas tokennya.',
          { expected: true },
        );
      }
    }

    if (!retryable) break;
    if (attempt < maxAttempts) {
      await sleep(retryDelayMs(attempt, response?.status, response?.headers));
    }
  }

  throw lastError || createError('AI request failed', ErrorTypes.NETWORK, null, { expected: true });
}

// =========================
// GENERATE REPLY
// =========================

/**
 * Hasilkan balasan AI untuk satu pesan user, sekaligus simpan ke riwayat.
 * @returns {Promise<string>}
 */
export async function generateReply(guildId, userId, { userMessage, displayName = null }) {
  const cfg = getProviderConfig();

  if (!cfg.apiKey) {
    throw createError(
      'AI_API_KEY is not configured',
      ErrorTypes.CONFIGURATION,
      'Fitur AI belum di-setup nih. Admin perlu ngisi **AI_API_KEY** dulu ya.',
      { expected: true },
    );
  }

  const text = String(userMessage || '').trim();
  if (!text) {
    throw createError('Empty AI prompt', ErrorTypes.VALIDATION, 'Pesannya kosong nih, tulis dulu yang mau ditanya 😄', {
      expected: true,
    });
  }

  const prompt = text.length > 4000 ? text.slice(0, 4000) : text;
  const history = await getHistory(guildId, userId);

  const messages = [
    { role: 'system', content: buildSystemPrompt(displayName) },
    ...history,
    { role: 'user', content: prompt },
  ];

  const reply = await requestCompletion(cfg, messages);

  const updated = [
    ...history,
    { role: 'user', content: prompt },
    { role: 'assistant', content: reply },
  ].slice(-cfg.maxHistory);

  try {
    await saveHistory(guildId, userId, updated);
  } catch (error) {
    // Gagal nyimpen riwayat jangan sampai bikin user nggak dapat balasan.
    logger.error('Gagal menyimpan riwayat AI:', { guildId, userId, error: error?.message });
  }

  return reply;
}

/**
 * Pesan error ramah untuk dipakai di handler non-interaction (AI Auto Chat).
 */
export function getAiErrorMessage(error) {
  if (error instanceof TitanBotError && error.userMessage) {
    return error.userMessage;
  }
  return 'Waduh ada error pas mikir nih 😵‍💫 coba ulang bentar lagi ya.';
}

/**
 * Pecah balasan panjang jadi beberapa pesan (batas 2000 karakter Discord).
 */
export function splitMessage(content, limit = 1900) {
  const text = String(content ?? '');
  if (text.length <= limit) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > limit) {
    let slice = remaining.slice(0, limit);
    const lastBreak = slice.lastIndexOf('\n');
    if (lastBreak > limit * 0.6) {
      slice = remaining.slice(0, lastBreak);
    }
    chunks.push(slice);
    remaining = remaining.slice(slice.length).replace(/^\n+/, '');
  }

  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

export default {
  isAiConfigured,
  getProviderConfig,
  getHistory,
  clearHistory,
  getAiChannelConfig,
  setAiChannel,
  clearAiChannel,
  getCooldownRemaining,
  markCooldown,
  enqueue,
  generateReply,
  getAiErrorMessage,
  splitMessage,
};
