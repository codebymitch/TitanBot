// salamReply.js — the bot answers "السلام عليكم" with "عليكم السلام" (report #191), in our server only.
//
// A message that starts with the greeting counts, in its common spellings ("السلام عليكم",
// "سلام عليكم ورحمة الله", "سلامو عليكو", "السلااام عليكم", "salam alaikum", "slm 3likom"); a reply
// to it ("وعليكم السلام") doesn't. The answer is a reply that pings the member. Each member gets one
// answer every SALAM_COOLDOWN_MS so greeting over and over doesn't make the bot spam; owners and the
// trusted staff (the Anti-Nuke trusted list, members or roles) have no cooldown.

import { isHomeGuild } from '../../config/homeGuild.js';
import { isServerOwner } from '../../config/serverOwners.js';
import { canLiftHardBan } from '../moderation/hardBanService.js';

export const SALAM_REPLY = 'عليكم السلام 👋';
export const SALAM_COOLDOWN_MS = 2 * 60_000;

const ARABIC = /^(?:ال|ا)?س+ل+ا+م+و*\s*ع+ل+ي*ك+(?:م+|و+|ن+)?(?=\s|$)/u;
const LATIN = /^(?:a?s+a?l+a+m+[ou]?|s+l+a*m+|slm)\s*(?:a?l+[ae]+[iy]*k+[ou]+m+|[3a]+[ae]*l+[ae]*[iy]*k+[ou]+m*|3likom|3lekom)(?=\s|$)/u;
const lastReply = new Map(); // guildId:userId -> time

function normalize(text) {
    return String(text || '').toLowerCase()
        .replace(/[ً-ٰٟـ​-‏]/gu, '')
        .replace(/[أإآٱ]/gu, 'ا')
        .replace(/ة/gu, 'ه')
        .replace(/ى/gu, 'ي')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/gu, ' ')
        .trim();
}

/** Whether `text` starts with "السلام عليكم" in one of its spellings. */
export function isSalam(text) {
    const normalized = normalize(text);
    return ARABIC.test(normalized) || LATIN.test(normalized);
}

/** Answers the greeting. Returns true when it did. */
export async function handleSalam(message, { now = Date.now(), isTrusted = canLiftHardBan } = {}) {
    if (!message.guild || message.author?.bot || !isHomeGuild(message.guild.id)) return false;
    if (!isSalam(message.content)) return false;
    const key = `${message.guild.id}:${message.author.id}`;
    const waiting = now - (lastReply.get(key) ?? -Infinity) < SALAM_COOLDOWN_MS;
    if (waiting && !isServerOwner(message.author.id) && !(await isTrusted(message.guild, message.author.id).catch(() => false))) return false;
    lastReply.set(key, now);
    await message.reply({ content: SALAM_REPLY, allowedMentions: { repliedUser: true } }).catch(() => {});
    return true;
}
