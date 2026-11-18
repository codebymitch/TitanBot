import { logger } from '../utils/logger.js';
import { createEmbed } from '../utils/embeds.js';
import {
  TEBAK_GAMBAR_IMAGES,
  TEBAK_GAMBAR_CATEGORIES,
  TEBAK_GAMBAR_DIFFICULTIES,
} from '../config/fun/tebakGambarDatabase.js';

// Semua state ronde disimpan di memori (per sesi permainan).
// Skor pemain disimpan permanen di database supaya tidak hilang saat restart.
const SESSION_GAP_MS = 4000;
const SCORE_KEY_PREFIX = 'tebakGambar:scores:';
const MAX_GUESS_LENGTH = 40;

export const DEFAULT_ROUND_SECONDS = 60;
export const MIN_ROUND_SECONDS = 15;
export const MAX_ROUND_SECONDS = 180;

const BASE_POINTS = { Mudah: 10, Sedang: 15, Sulit: 20 };
const HINT_PENALTY = 3;
const MIN_POINTS = 5;

// guildId -> session
const sessions = new Map();

export function getPlayableImages() {
  return TEBAK_GAMBAR_IMAGES.filter((entry) => entry.imageUrl);
}

export function getCategoryChoices() {
  return TEBAK_GAMBAR_CATEGORIES.map((name) => ({ name, value: name }));
}

export function getDifficultyChoices() {
  return TEBAK_GAMBAR_DIFFICULTIES.map((name) => ({ name, value: name }));
}

export function isKnownCategory(value) {
  return TEBAK_GAMBAR_CATEGORIES.some((name) => name.toLowerCase() === String(value || '').toLowerCase());
}

function resolveCategory(value) {
  const match = TEBAK_GAMBAR_CATEGORIES.find((name) => name.toLowerCase() === String(value || '').toLowerCase());
  return match || null;
}

function resolveDifficulty(value) {
  const match = TEBAK_GAMBAR_DIFFICULTIES.find((name) => name.toLowerCase() === String(value || '').toLowerCase());
  return match || null;
}

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeCompact(text) {
  return normalizeText(text).replace(/\s+/g, '');
}

export function isCorrectGuess(entry, content) {
  if (!entry) {
    return false;
  }

  const guess = normalizeText(content);
  if (!guess) {
    return false;
  }

  const candidates = [entry.answer, ...(entry.aliases || [])];
  const guessCompact = normalizeCompact(content);

  return candidates.some((candidate) => {
    const normalized = normalizeText(candidate);
    return normalized === guess || normalizeCompact(candidate) === guessCompact;
  });
}

function buildPattern(answer, revealedCount) {
  let revealed = 0;
  return String(answer)
    .split('')
    .map((char) => {
      if (char === ' ') return ' ';
      if (char === '-' || char === "'" || char === '.') return char;
      revealed += 1;
      return revealed <= revealedCount ? char : '_';
    })
    .join('');
}

function pickEntry(session) {
  const pool = getPlayableImages().filter((entry) => {
    const matchesCategory = session.category === 'Campuran' || entry.category === session.category;
    const matchesDifficulty = !session.difficulty || entry.difficulty === session.difficulty;
    return matchesCategory && matchesDifficulty;
  });

  let available = pool.filter((entry) => !session.usedIds.has(entry.id));
  if (available.length === 0) {
    session.usedIds.clear();
    available = pool;
  }
  if (available.length === 0) {
    return null;
  }

  return available[Math.floor(Math.random() * available.length)];
}

function computePoints(entry, hintsShown) {
  const base = BASE_POINTS[entry.difficulty] || 10;
  return Math.max(MIN_POINTS, base - hintsShown * HINT_PENALTY);
}

function buildHints(entry) {
  const letters = entry.answer.replace(/[^A-Za-z0-9]/g, '').length;
  return [
    `Kategori: **${entry.category}** • Jumlah huruf: **${letters}**`,
    `Pola: ${buildPattern(entry.answer, 1)}`,
    `Pola: ${buildPattern(entry.answer, 2)}`,
  ];
}

function buildRoundEmbed(session) {
  const entry = session.currentEntry;
  const endsAt = session.roundEndsAt;
  const hints = session.hintsShown > 0 ? session.hintLines.join('\n') : 'Belum ada petunjuk.';

  return createEmbed({
    title: `Tebak Gambar — Ronde ${session.round}`,
    description: [
      'Gambar apakah ini? Ketik jawabanmu langsung di chat.',
      '',
      `**Petunjuk**\n${hints}`,
    ].join('\n'),
    color: 'blurple',
    image: entry.imageUrl,
    fields: [
      { name: 'Kategori', value: entry.category, inline: true },
      { name: 'Kesulitan', value: entry.difficulty, inline: true },
      { name: 'Poin', value: `${computePoints(entry, session.hintsShown)}`, inline: true },
      { name: 'Waktu tersisa', value: `<t:${Math.floor(endsAt / 1000)}:R>`, inline: false },
    ],
  });
}

function buildRevealEmbed(session, { winnerId = null, points = 0 }) {
  const entry = session.currentEntry;
  const won = Boolean(winnerId);

  return createEmbed({
    title: won ? `Tebak Gambar — Ronde ${session.round} Selesai` : `Tebak Gambar — Ronde ${session.round} Waktu Habis`,
    description: [
      won
        ? `<@${winnerId}> berhasil menebak dan mendapat **${points}** poin!`
        : 'Tidak ada yang berhasil menebak gambar ini tepat waktu.',
      '',
      `Jawaban: **${entry.answer}**`,
    ].join('\n'),
    color: won ? 'success' : 'error',
    image: entry.imageUrl,
  });
}

async function getChannel(client, channelId) {
  const cached = client.channels.cache.get(channelId);
  if (cached) {
    return cached;
  }
  return client.channels.fetch(channelId).catch(() => null);
}

function clearTimers(session) {
  (session.hintTimers || []).forEach((timer) => clearTimeout(timer));
  if (session.endTimer) clearTimeout(session.endTimer);
  if (session.gapTimer) clearTimeout(session.gapTimer);
  session.hintTimers = [];
  session.endTimer = null;
  session.gapTimer = null;
}

function scheduleHints(session) {
  const startAt = session.roundStartedAt;
  const total = session.roundEndsAt - startAt;
  const thresholds = [0.4, 0.65, 0.85];

  session.hintTimers = thresholds.map((ratio, index) => {
    const delay = Math.max(1000, Math.round(total * ratio) - (Date.now() - startAt));
    return setTimeout(() => {
      if (!session.active || session.solved || !session.currentEntry) return;
      if (session.hintsShown >= index + 1) return;

      session.hintsShown = index + 1;
      session.roundMessage?.edit({ embeds: [buildRoundEmbed(session)] }).catch(() => {});
    }, delay);
  });
}

function scheduleRoundEnd(session, client) {
  const delay = Math.max(1000, session.roundEndsAt - Date.now());
  session.endTimer = setTimeout(async () => {
    if (!session.active || session.solved) return;
    await finishRound(session, client, { winnerId: null });
  }, delay);
}

function scheduleNextRound(session, client) {
  session.gapTimer = setTimeout(() => {
    if (!session.active) return;
    startRound(session, client).catch((error) => {
      logger.error('Failed to start next tebak gambar round:', error);
    });
  }, SESSION_GAP_MS);
}

async function startRound(session, client) {
  const entry = pickEntry(session);
  if (!entry) {
    await stopSession(session, client, 'Semua gambar untuk kategori ini sudah dimainkan.');
    return;
  }

  clearTimers(session);
  session.round += 1;
  session.usedIds.add(entry.id);
  session.currentEntry = entry;
  session.solved = false;
  session.hintsShown = 0;
  session.hintLines = buildHints(entry);
  session.roundStartedAt = Date.now();
  session.roundEndsAt = session.roundStartedAt + session.durationSec * 1000;
  session.roundMessage = null;

  const payload = { embeds: [buildRoundEmbed(session)] };

  try {
    if (session.deliverFirstRound) {
      const deliver = session.deliverFirstRound;
      session.deliverFirstRound = null;
      session.roundMessage = await deliver(payload);
    } else {
      const channel = await getChannel(client, session.channelId);
      if (!channel) {
        await stopSession(session, client, 'Channel permainan tidak ditemukan.');
        return;
      }
      session.roundMessage = await channel.send(payload);
    }
  } catch (error) {
    logger.error('Failed to send tebak gambar round message:', error);
    await stopSession(session, client, 'Gagal mengirim gambar ronde berikutnya.');
    return;
  }

  scheduleHints(session);
  scheduleRoundEnd(session, client);
}

async function finishRound(session, client, { winnerId, points = 0 }) {
  if (session.solved) return;
  session.solved = true;
  clearTimers(session);

  const revealEmbed = buildRevealEmbed(session, { winnerId, points });

  if (session.roundMessage) {
    await session.roundMessage.edit({ embeds: [revealEmbed] }).catch(() => {});
  } else {
    const channel = await getChannel(client, session.channelId);
    await channel?.send({ embeds: [revealEmbed] }).catch(() => {});
  }

  if (winnerId) {
    await addScore(client, session.guildId, winnerId, points).catch((error) =>
      logger.error('Failed to save tebak gambar score:', error),
    );
  }

  scheduleNextRound(session, client);
}

async function stopSession(session, client, reason = null) {
  session.active = false;
  clearTimers(session);
  sessions.delete(session.guildId);

  if (reason) {
    const channel = await getChannel(client, session.channelId);
    await channel
      ?.send({ embeds: [createEmbed({ title: 'Tebak Gambar Berhenti', description: reason, color: 'secondary' })] })
      .catch(() => {});
  }
}

export function getSession(guildId) {
  return sessions.get(guildId) || null;
}

export async function startGame(client, {
  guildId,
  channelId,
  hostId,
  category = 'Campuran',
  difficulty = null,
  durationSec = DEFAULT_ROUND_SECONDS,
  deliverFirstRound = null,
}) {
  const existing = sessions.get(guildId);
  if (existing?.active) {
    return { started: false, reason: 'already_running', channelId: existing.channelId };
  }

  const pool = getPlayableImages();
  if (pool.length === 0) {
    return { started: false, reason: 'no_images' };
  }

  const resolvedCategory = resolveCategory(category) || 'Campuran';
  const resolvedDifficulty = difficulty ? resolveDifficulty(difficulty) : null;

  const session = {
    guildId,
    channelId,
    hostId,
    category: resolvedCategory,
    difficulty: resolvedDifficulty,
    durationSec: Math.min(MAX_ROUND_SECONDS, Math.max(MIN_ROUND_SECONDS, Number(durationSec) || DEFAULT_ROUND_SECONDS)),
    round: 0,
    usedIds: new Set(),
    currentEntry: null,
    solved: false,
    hintsShown: 0,
    hintLines: [],
    roundStartedAt: 0,
    roundEndsAt: 0,
    roundMessage: null,
    active: true,
    deliverFirstRound,
    hintTimers: [],
    endTimer: null,
    gapTimer: null,
  };

  sessions.set(guildId, session);
  await startRound(session, client);
  return { started: true, session };
}

export async function stopGame(client, guildId, { userId = null, force = false } = {}) {
  const session = sessions.get(guildId);
  if (!session?.active) {
    return { stopped: false, reason: 'not_running' };
  }

  if (!force && userId && session.hostId !== userId) {
    return { stopped: false, reason: 'not_host', channelId: session.channelId };
  }

  const channelId = session.channelId;
  const round = session.round;
  await stopSession(session, client, 'Permainan tebak gambar dihentikan.');
  return { stopped: true, channelId, round };
}

export async function handleGuess(message, client) {
  const guildId = message.guild?.id;
  if (!guildId) return false;

  const session = sessions.get(guildId);
  if (!session?.active || session.solved || !session.currentEntry) return false;
  if (message.channel.id !== session.channelId) return false;
  if (message.author?.bot) return false;

  const content = message.content?.trim();
  if (!content || content.length > MAX_GUESS_LENGTH) return false;

  if (!isCorrectGuess(session.currentEntry, content)) {
    return false;
  }

  const points = computePoints(session.currentEntry, session.hintsShown);
  await finishRound(session, client, { winnerId: message.author.id, points });
  return true;
}

// ---------------- Skor & leaderboard ----------------

function scoreKey(guildId) {
  return `${SCORE_KEY_PREFIX}${guildId}`;
}

export async function getScores(client, guildId) {
  try {
    const raw = await client.db.get(scoreKey(guildId));
    return raw && typeof raw === 'object' ? raw : {};
  } catch (error) {
    logger.error('Failed to load tebak gambar scores:', { guildId, error });
    return {};
  }
}

async function saveScores(client, guildId, scores) {
  await client.db.set(scoreKey(guildId), scores);
}

export async function addScore(client, guildId, userId, points) {
  const scores = await getScores(client, guildId);
  const current = scores[userId] || { points: 0, correct: 0 };
  scores[userId] = {
    points: current.points + points,
    correct: current.correct + 1,
  };
  await saveScores(client, guildId, scores);
  return scores[userId];
}

export async function getUserScore(client, guildId, userId) {
  const scores = await getScores(client, guildId);
  return scores[userId] || { points: 0, correct: 0 };
}

export async function getLeaderboard(client, guildId, limit = 10) {
  const scores = await getScores(client, guildId);
  return Object.entries(scores)
    .map(([userId, value]) => ({ userId, points: value.points || 0, correct: value.correct || 0 }))
    .sort((a, b) => b.points - a.points || b.correct - a.correct)
    .slice(0, limit);
}
