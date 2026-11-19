import { AttachmentBuilder } from 'discord.js';
import axios from 'axios';
import { createCanvas, loadImage } from '@napi-rs/canvas';
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

// Mode permainan: gambar utuh (klasik) atau potongan detail yang di-zoom bertahap.
export const MODE_CLASSIC = 'classic';
export const MODE_ZOOM = 'zoom';

const BASE_POINTS = { Easy: 10, Medium: 15, Hard: 20 };
const HINT_PENALTY = 3;
const MIN_POINTS = 5;

// Konfigurasi potongan kecil (crop detail yang di-zoom).
const ZOOM_SIZE = 640; // ukuran kanvas persegi (px)
// Bagian gambar yang terlihat di awal ronde (makin kecil makin sulit).
const ZOOM_START_SCALE = { Easy: 0.6, Medium: 0.45, Hard: 0.3 };
const ZOOM_ATTACHMENT_NAME = 'tebak-gambar-potongan.png';
const IMAGE_USER_AGENT = 'TitanBot/2.1 (Discord bot; guess-the-picture feature)';
const IMAGE_CACHE_MAX = 40;

// guildId -> session
const sessions = new Map();
// url gambar -> Buffer (supaya tidak unduh ulang tiap buka potongan)
const imageCache = new Map();

export function getPlayableImages() {
  return TEBAK_GAMBAR_IMAGES.filter((entry) => entry.imageUrl);
}

export function getCategoryChoices() {
  return TEBAK_GAMBAR_CATEGORIES.map((name) => ({ name, value: name }));
}

export function getDifficultyChoices() {
  return TEBAK_GAMBAR_DIFFICULTIES.map((name) => ({ name, value: name }));
}

export function getModeChoices() {
  return [
    { name: 'Classic (full image)', value: MODE_CLASSIC },
    { name: 'Zoom (small detail)', value: MODE_ZOOM },
  ];
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

function resolveMode(value) {
  return String(value || '').toLowerCase() === MODE_ZOOM ? MODE_ZOOM : MODE_CLASSIC;
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
    const matchesCategory = session.category === 'Mixed' || entry.category === session.category;
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
    `Category: **${entry.category}** • Letters: **${letters}**`,
    `Pola: ${buildPattern(entry.answer, 1)}`,
    `Pola: ${buildPattern(entry.answer, 2)}`,
  ];
}

// ---------------- Render gambar potongan ----------------

async function getSourceImage(url) {
  const cached = imageCache.get(url);
  if (cached) {
    return cached;
  }

  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
    headers: { 'User-Agent': IMAGE_USER_AGENT },
  });
  const buffer = Buffer.from(response.data);

  if (imageCache.size >= IMAGE_CACHE_MAX) {
    const oldestKey = imageCache.keys().next().value;
    imageCache.delete(oldestKey);
  }
  imageCache.set(url, buffer);
  return buffer;
}

// Ambil potongan kecil dari gambar asli pada posisi tertentu, lalu perbesar
// supaya detailnya terlihat jelas. `scale` = bagian gambar yang terlihat (0-1),
// `center` = titik fokus potongan dalam koordinat 0-1 dari gambar.
async function renderZoomImage(sourceBuffer, scale, center) {
  const image = await loadImage(sourceBuffer);
  const canvas = createCanvas(ZOOM_SIZE, ZOOM_SIZE);
  const ctx = canvas.getContext('2d');

  const cropWidth = Math.max(1, image.width * scale);
  const cropHeight = Math.max(1, image.height * scale);
  const cropX = Math.min(Math.max(center.x * image.width - cropWidth / 2, 0), image.width - cropWidth);
  const cropY = Math.min(Math.max(center.y * image.height - cropHeight / 2, 0), image.height - cropHeight);

  // Isi penuh kanvas persegi (cover) tanpa membuat gambar gepeng.
  const drawScale = Math.max(ZOOM_SIZE / cropWidth, ZOOM_SIZE / cropHeight);
  const drawWidth = cropWidth * drawScale;
  const drawHeight = cropHeight * drawScale;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    image,
    cropX, cropY, cropWidth, cropHeight,
    (ZOOM_SIZE - drawWidth) / 2, (ZOOM_SIZE - drawHeight) / 2, drawWidth, drawHeight,
  );

  return canvas.toBuffer('image/png');
}

// Tahap pelebaran potongan: mulai dari potongan kecil lalu melebar sampai penuh.
function zoomRevealTargets(startScale) {
  const remaining = 1 - startScale;
  return [
    Math.min(1, startScale + remaining * 0.33),
    Math.min(1, startScale + remaining * 0.66),
    1,
  ];
}

// ---------------- Embed & payload ----------------

function buildRoundFields(session) {
  const entry = session.currentEntry;
  return [
    { name: 'Category', value: entry.category, inline: true },
    { name: 'Difficulty', value: entry.difficulty, inline: true },
    { name: 'Points', value: `${computePoints(entry, session.hintsShown)}`, inline: true },
    { name: 'Time left', value: `<t:${Math.floor(session.roundEndsAt / 1000)}:R>`, inline: false },
  ];
}

function buildClassicPayload(session) {
  const entry = session.currentEntry;
  const hints = session.hintsShown > 0 ? session.hintLines.join('\n') : 'No hints yet.';

  return {
    embeds: [
      createEmbed({
        title: `Guess the Picture — Round ${session.round}`,
        description: [
          'What image is this? Type your answer right in the chat.',
          '',
          `**Hints**\n${hints}`,
        ].join('\n'),
        color: 'blurple',
        image: entry.imageUrl,
        fields: buildRoundFields(session),
      }),
    ],
  };
}

async function buildZoomPayload(session) {
  const entry = session.currentEntry;
  const source = await getSourceImage(entry.imageUrl);
  const png = await renderZoomImage(source, session.zoomScale, session.zoomCenter);

  return {
    embeds: [
      createEmbed({
        title: `Guess the Picture: Zoom — Round ${session.round}`,
        description: [
          'What object is this? Type your answer right in the chat.',
          '',
          `**Hints**\nVisible area: **${Math.round(session.zoomScale * 100)}%**`,
        ].join('\n'),
        color: 'blurple',
        image: `attachment://${ZOOM_ATTACHMENT_NAME}`,
        fields: buildRoundFields(session),
      }),
    ],
    files: [new AttachmentBuilder(png, { name: ZOOM_ATTACHMENT_NAME })],
  };
}

async function buildRoundPayload(session) {
  if (session.mode === MODE_ZOOM) {
    try {
      return await buildZoomPayload(session);
    } catch (error) {
      logger.error('Gagal membuat potongan gambar, memakai gambar utuh:', error);
    }
  }
  return buildClassicPayload(session);
}

function buildRevealEmbed(session, { winnerId = null, points = 0 }) {
  const entry = session.currentEntry;
  const won = Boolean(winnerId);
  const zoom = session.mode === MODE_ZOOM;

  return createEmbed({
    title: won
      ? `Guess the Picture${zoom ? ' (Zoom)' : ''} — Round ${session.round} Solved`
      : `Guess the Picture${zoom ? ' (Zoom)' : ''} — Round ${session.round} Time's Up`,
    description: [
      won
        ? `<@${winnerId}> guessed it and earned **${points}** points!`
        : 'No one managed to guess this image in time.',
      '',
      `Answer: **${entry.answer}**`,
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

async function editRoundMessage(session, payload) {
  if (!session.roundMessage) return;
  const editPayload = payload.files ? { ...payload, attachments: [] } : payload;
  await session.roundMessage.edit(editPayload).catch(() => {});
}

function scheduleHints(session) {
  const startAt = session.roundStartedAt;
  const total = session.roundEndsAt - startAt;
  const thresholds = [0.4, 0.65, 0.85];

  session.hintTimers = thresholds.map((ratio, index) => {
    const delay = Math.max(1000, Math.round(total * ratio) - (Date.now() - startAt));
    return setTimeout(async () => {
      if (!session.active || session.solved || !session.currentEntry) return;
      if (session.hintsShown >= index + 1) return;

      session.hintsShown = index + 1;
      if (session.mode === MODE_ZOOM) {
        session.zoomScale = session.zoomTargets[index];
      }

      const payload = await buildRoundPayload(session);
      await editRoundMessage(session, payload);
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
    await stopSession(session, client, 'All images for this category have been played.');
    return;
  }

  clearTimers(session);
  session.round += 1;
  session.usedIds.add(entry.id);
  session.currentEntry = entry;
  session.solved = false;
  session.hintsShown = 0;
  session.hintLines = buildHints(entry);
  // Potongan awal & titik fokus berbeda tiap ronde, lalu melebar bertahap.
  session.zoomScale = ZOOM_START_SCALE[entry.difficulty] || 0.3;
  session.zoomCenter = { x: Math.random(), y: Math.random() };
  session.zoomTargets = zoomRevealTargets(session.zoomScale);
  session.roundStartedAt = Date.now();
  session.roundEndsAt = session.roundStartedAt + session.durationSec * 1000;
  session.roundMessage = null;

  const payload = await buildRoundPayload(session);

  try {
    if (session.deliverFirstRound) {
      const deliver = session.deliverFirstRound;
      session.deliverFirstRound = null;
      session.roundMessage = await deliver(payload);
    } else {
      const channel = await getChannel(client, session.channelId);
      if (!channel) {
        await stopSession(session, client, 'Game channel not found.');
        return;
      }
      session.roundMessage = await channel.send(payload);
    }
  } catch (error) {
    logger.error('Failed to send tebak gambar round message:', error);
    await stopSession(session, client, 'Failed to send the next round image.');
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
    const editPayload = session.mode === MODE_ZOOM
      ? { embeds: [revealEmbed], attachments: [] }
      : { embeds: [revealEmbed] };
    await session.roundMessage.edit(editPayload).catch(() => {});
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
      ?.send({ embeds: [createEmbed({ title: 'Guess the Picture Stopped', description: reason, color: 'secondary' })] })
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
  category = 'Mixed',
  difficulty = null,
  durationSec = DEFAULT_ROUND_SECONDS,
  mode = MODE_CLASSIC,
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

  const resolvedCategory = resolveCategory(category) || 'Mixed';
  const resolvedDifficulty = difficulty ? resolveDifficulty(difficulty) : null;

  const session = {
    guildId,
    channelId,
    hostId,
    mode: resolveMode(mode),
    category: resolvedCategory,
    difficulty: resolvedDifficulty,
    durationSec: Math.min(MAX_ROUND_SECONDS, Math.max(MIN_ROUND_SECONDS, Number(durationSec) || DEFAULT_ROUND_SECONDS)),
    round: 0,
    usedIds: new Set(),
    currentEntry: null,
    solved: false,
    hintsShown: 0,
    hintLines: [],
    zoomScale: 1,
    zoomCenter: { x: 0.5, y: 0.5 },
    zoomTargets: [],
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
  await stopSession(session, client, 'The guess-the-picture game has been stopped.');
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
