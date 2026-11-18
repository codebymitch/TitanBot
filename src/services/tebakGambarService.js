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

// Mode permainan: gambar utuh (klasik) atau potongan bertahap (zoom puzzle).
export const MODE_CLASSIC = 'classic';
export const MODE_PUZZLE = 'puzzle';

const BASE_POINTS = { Mudah: 10, Sedang: 15, Sulit: 20 };
const HINT_PENALTY = 3;
const MIN_POINTS = 5;

// Konfigurasi gambar potongan (zoom puzzle).
const PUZZLE_SIZE = 640; // ukuran kanvas persegi (px)
const PUZZLE_GRID = 4; // 4x4 = 16 potongan
const PUZZLE_TILES = PUZZLE_GRID * PUZZLE_GRID;
const PUZZLE_START_TILES = { Mudah: 4, Sedang: 2, Sulit: 1 };
const PUZZLE_ATTACHMENT_NAME = 'tebak-gambar-potongan.png';
const IMAGE_USER_AGENT = 'TitanBot/2.1 (Discord bot; fitur tebak gambar)';
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
    { name: 'Klasik (gambar utuh)', value: MODE_CLASSIC },
    { name: 'Potongan (zoom puzzle)', value: MODE_PUZZLE },
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
  return String(value || '').toLowerCase() === MODE_PUZZLE ? MODE_PUZZLE : MODE_CLASSIC;
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

async function renderPuzzleImage(sourceBuffer, revealedTiles) {
  const image = await loadImage(sourceBuffer);
  const canvas = createCanvas(PUZZLE_SIZE, PUZZLE_SIZE);
  const ctx = canvas.getContext('2d');

  // Isi penuh kanvas (cover) supaya potongan tajam dan tidak gepeng.
  const scale = Math.max(PUZZLE_SIZE / image.width, PUZZLE_SIZE / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(image, (PUZZLE_SIZE - drawWidth) / 2, (PUZZLE_SIZE - drawHeight) / 2, drawWidth, drawHeight);

  const tile = PUZZLE_SIZE / PUZZLE_GRID;
  for (let row = 0; row < PUZZLE_GRID; row += 1) {
    for (let col = 0; col < PUZZLE_GRID; col += 1) {
      const index = row * PUZZLE_GRID + col;
      if (revealedTiles.has(index)) continue;

      ctx.fillStyle = '#1f2124';
      ctx.fillRect(col * tile, row * tile, tile, tile);
      ctx.strokeStyle = '#34363b';
      ctx.lineWidth = 3;
      ctx.strokeRect(col * tile + 1.5, row * tile + 1.5, tile - 3, tile - 3);
    }
  }

  return canvas.toBuffer('image/png');
}

function revealRandomTiles(session, target) {
  const remaining = [];
  for (let i = 0; i < PUZZLE_TILES; i += 1) {
    if (!session.revealedTiles.has(i)) {
      remaining.push(i);
    }
  }

  for (let i = remaining.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
  }

  let need = target - session.revealedTiles.size;
  for (const tile of remaining) {
    if (need <= 0) break;
    session.revealedTiles.add(tile);
    need -= 1;
  }
}

function puzzleRevealTargets(session) {
  const start = session.startTiles;
  const remaining = PUZZLE_TILES - start;
  return [
    Math.min(PUZZLE_TILES, start + Math.round(remaining * 0.25)),
    Math.min(PUZZLE_TILES, start + Math.round(remaining * 0.6)),
    // Tahap terakhir membuka seluruh gambar supaya objek terlihat penuh saat waktu hampir habis.
    PUZZLE_TILES,
  ];
}

// ---------------- Embed & payload ----------------

function buildRoundFields(session) {
  const entry = session.currentEntry;
  return [
    { name: 'Kategori', value: entry.category, inline: true },
    { name: 'Kesulitan', value: entry.difficulty, inline: true },
    { name: 'Poin', value: `${computePoints(entry, session.hintsShown)}`, inline: true },
    { name: 'Waktu tersisa', value: `<t:${Math.floor(session.roundEndsAt / 1000)}:R>`, inline: false },
  ];
}

function buildClassicPayload(session) {
  const entry = session.currentEntry;
  const hints = session.hintsShown > 0 ? session.hintLines.join('\n') : 'Belum ada petunjuk.';

  return {
    embeds: [
      createEmbed({
        title: `Tebak Gambar — Ronde ${session.round}`,
        description: [
          'Gambar apakah ini? Ketik jawabanmu langsung di chat.',
          '',
          `**Petunjuk**\n${hints}`,
        ].join('\n'),
        color: 'blurple',
        image: entry.imageUrl,
        fields: buildRoundFields(session),
      }),
    ],
  };
}

async function buildPuzzlePayload(session) {
  const entry = session.currentEntry;
  const source = await getSourceImage(entry.imageUrl);
  const png = await renderPuzzleImage(source, session.revealedTiles);

  return {
    embeds: [
      createEmbed({
        title: `Tebak Gambar Potongan — Ronde ${session.round}`,
        description: [
          'Objek apakah ini? Ketik jawabanmu langsung di chat.',
          '',
          `**Petunjuk**\nPotongan terbuka: **${session.revealedTiles.size}/${PUZZLE_TILES}**`,
        ].join('\n'),
        color: 'blurple',
        image: `attachment://${PUZZLE_ATTACHMENT_NAME}`,
        fields: buildRoundFields(session),
      }),
    ],
    files: [new AttachmentBuilder(png, { name: PUZZLE_ATTACHMENT_NAME })],
  };
}

async function buildRoundPayload(session) {
  if (session.mode === MODE_PUZZLE) {
    try {
      return await buildPuzzlePayload(session);
    } catch (error) {
      logger.error('Gagal membuat gambar potongan, memakai gambar utuh:', error);
    }
  }
  return buildClassicPayload(session);
}

function buildRevealEmbed(session, { winnerId = null, points = 0 }) {
  const entry = session.currentEntry;
  const won = Boolean(winnerId);
  const puzzle = session.mode === MODE_PUZZLE;

  return createEmbed({
    title: won
      ? `Tebak Gambar${puzzle ? ' Potongan' : ''} — Ronde ${session.round} Selesai`
      : `Tebak Gambar${puzzle ? ' Potongan' : ''} — Ronde ${session.round} Waktu Habis`,
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
      if (session.mode === MODE_PUZZLE) {
        revealRandomTiles(session, session.revealTargets[index]);
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
  session.revealedTiles = new Set();
  // Potongan awal & target pembukaan berbeda tiap ronde.
  session.startTiles = PUZZLE_START_TILES[entry.difficulty] || 1;
  session.revealTargets = puzzleRevealTargets(session);
  if (session.mode === MODE_PUZZLE) {
    revealRandomTiles(session, session.startTiles);
  }
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
    const editPayload = session.mode === MODE_PUZZLE
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

  const resolvedCategory = resolveCategory(category) || 'Campuran';
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
    revealedTiles: new Set(),
    startTiles: 1,
    revealTargets: [],
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
