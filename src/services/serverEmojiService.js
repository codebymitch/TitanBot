import { readdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { PermissionFlagsBits } from 'discord.js';
import { isHomeGuild } from '../config/homeGuild.js';
import { PEEPO_EMOJIS } from '../config/peepoEmojis.js';

// Server emojis (void / chaos, shop, economy, moderation...) live as PNGs in src/assets/emojis.
// Each file is uploaded once under its file name; emojis already on the server are left alone.
const EMOJI_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../assets/emojis');

export async function listServerEmojiFiles() {
  const files = await readdir(EMOJI_DIR);
  return files
    .filter((file) => file.endsWith('.png'))
    .map((file) => ({ name: path.basename(file, '.png'), file: path.join(EMOJI_DIR, file) }));
}

const ANIMATED_DIR = path.join(EMOJI_DIR, 'animated');

export async function listAnimatedEmojiFiles() {
  const files = await readdir(ANIMATED_DIR);
  return files
    .filter((file) => file.endsWith('.gif'))
    .map((file) => ({ name: path.basename(file, '.gif'), file: path.join(ANIMATED_DIR, file) }));
}

/** Uploads the missing server emojis. Returns counts, or `skipped` when the bot lacks the permission. */
export async function ensureServerEmojis(guild) {
  const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
    return { skipped: true, added: 0, failed: 0 };
  }

  const existing = await guild.emojis.fetch();
  const existingNames = new Set(existing.map((emoji) => emoji.name));
  let added = 0;
  let failed = 0;
  for (const { name, file } of await listServerEmojiFiles()) {
    if (existingNames.has(name)) continue;
    try {
      await guild.emojis.create({ attachment: file, name, reason: 'Server emoji set' });
      added += 1;
    } catch {
      // Usually the server's emoji slots are full.
      failed += 1;
    }
  }
  return { skipped: false, added, failed };
}

/** Home server only: uploads the Peepo pack (from Discord's CDN) for the ones the server does not have yet. */
export async function ensurePeepoEmojis(guild) {
  if (!isHomeGuild(guild.id)) return { skipped: true, added: 0, failed: 0 };
  const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
    return { skipped: true, added: 0, failed: 0 };
  }

  const existing = await guild.emojis.fetch();
  const existingNames = new Set(existing.map((emoji) => emoji.name));
  let added = 0;
  let failed = 0;
  for (const { name, url } of PEEPO_EMOJIS) {
    if (existingNames.has(name)) continue;
    try {
      await guild.emojis.create({ attachment: url, name, reason: 'Peepo emoji pack' });
      added += 1;
    } catch {
      failed += 1;
    }
  }
  return { skipped: false, added, failed };
}

/** Home server only: uploads the animated face emojis (GIFs in src/assets/emojis/animated). */
export async function ensureAnimatedEmojis(guild) {
  if (!isHomeGuild(guild.id)) return { skipped: true, added: 0, failed: 0 };
  const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
    return { skipped: true, added: 0, failed: 0 };
  }

  const existing = await guild.emojis.fetch();
  const existingNames = new Set(existing.map((emoji) => emoji.name));
  let added = 0;
  let failed = 0;
  for (const { name, file } of await listAnimatedEmojiFiles()) {
    if (existingNames.has(name)) continue;
    try {
      await guild.emojis.create({ attachment: file, name, reason: 'Animated face emojis' });
      added += 1;
    } catch {
      failed += 1;
    }
  }
  return { skipped: false, added, failed };
}
