// geminiService.js — answers staff questions through the Google Gemini API.
//
// Config (all via .env):
//   GEMINI_API_KEY      required; if empty the AI feature is simply disabled
//   GEMINI_MODEL        optional; defaults to DEFAULT_MODEL below
//   GEMINI_TIMEOUT_MS   optional; request timeout (default 20000)
//   BOT_DISPLAY_NAME    optional; name the AI uses for itself (default "Strommc bot")

import { logger } from '../utils/logger.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-3.8-flash';
const DEFAULT_TIMEOUT_MS = 20000;
const DISCORD_MESSAGE_LIMIT = 2000;
const MAX_QUESTION_LENGTH = 1500;

export function getBotDisplayName() {
  return process.env.BOT_DISPLAY_NAME?.trim() || 'Strommc bot';
}

export function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

function buildSystemInstruction() {
  return [
    `You are ${getBotDisplayName()}, a helpful assistant that lives inside a Discord server.`,
    'You are answering a question from a staff member.',
    'Reply in the same language the user wrote in (including Hinglish if they use it).',
    'Keep answers short and clear — ideally under 1500 characters.',
    'Use plain Discord-friendly markdown. Never mention @everyone or @here.',
    'If you do not know something, say so instead of guessing.',
  ].join(' ');
}

/**
 * Split text into chunks that fit in a Discord message, preferring line breaks.
 */
export function splitForDiscord(text, limit = DISCORD_MESSAGE_LIMIT) {
  const chunks = [];
  let remaining = String(text ?? '').trim();

  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf('\n', limit);
    if (cut < limit * 0.5) {
      cut = remaining.lastIndexOf(' ', limit);
    }
    if (cut < limit * 0.5) {
      cut = limit;
    }
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }
  return chunks;
}

/**
 * Ask Gemini a question. Returns the answer text.
 * Throws an Error with a user-safe `userMessage` on failure; the API key is never logged.
 */
export async function askGemini(question) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    const error = new Error('GEMINI_API_KEY is not set');
    error.userMessage = 'AI is not configured yet. Ask the bot owner to add the Gemini API key.';
    throw error;
  }

  const prompt = String(question ?? '').trim().slice(0, MAX_QUESTION_LENGTH);
  if (!prompt) {
    const error = new Error('Empty question');
    error.userMessage = 'Please ask me a question.';
    throw error;
  }

  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

  let response;
  try {
    response = await fetch(`${API_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: buildSystemInstruction() }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 800, temperature: 0.7 },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    const timedOut = cause?.name === 'TimeoutError' || cause?.name === 'AbortError';
    logger.warn(`Gemini request failed (${timedOut ? 'timeout' : cause?.message || 'network error'})`);
    const error = new Error('Gemini request failed', { cause });
    error.userMessage = timedOut
      ? 'The AI took too long to answer. Please try again.'
      : 'I could not reach the AI service. Please try again in a moment.';
    throw error;
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Non-JSON body; handled below.
  }

  if (!response.ok) {
    const apiMessage = data?.error?.message || response.statusText;
    logger.warn(`Gemini API error ${response.status} (model: ${model}): ${apiMessage}`);
    const error = new Error(`Gemini API error ${response.status}: ${apiMessage}`);
    if (response.status === 429) {
      error.userMessage = 'The AI is busy right now (rate limit). Please try again shortly.';
    } else if (response.status === 400 || response.status === 401 || response.status === 403) {
      error.userMessage = 'The AI key looks invalid or not allowed. Ask the bot owner to check it.';
    } else if (response.status === 404) {
      error.userMessage = 'The configured AI model was not found. Ask the bot owner to check GEMINI_MODEL.';
    } else {
      error.userMessage = 'The AI service had a problem. Please try again in a moment.';
    }
    throw error;
  }

  const candidate = data?.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .map((part) => part?.text ?? '')
    .join('')
    .trim();

  if (!text) {
    const blocked = data?.promptFeedback?.blockReason || candidate?.finishReason;
    logger.warn(`Gemini returned no text (reason: ${blocked || 'unknown'})`);
    const error = new Error('Gemini returned an empty response');
    error.userMessage = 'I could not come up with an answer for that. Try rephrasing your question.';
    throw error;
  }

  return text;
}
