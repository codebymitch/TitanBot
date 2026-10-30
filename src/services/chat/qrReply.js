// qrReply.js — whoever types "qr" gets the QR code of our guns.lol page, in our server only.
//
// The code is a fixed image (src/assets/qr-guns-lol.png, made once from QR_LINK), so there is nothing
// to generate at runtime and it never changes. Only a message that is just "qr" counts, not a sentence
// that has the word in it. Each member gets one answer every QR_COOLDOWN_MS so typing it over and over
// doesn't make the bot spam.

import { fileURLToPath } from 'node:url';
import { AttachmentBuilder } from 'discord.js';
import { isHomeGuild } from '../../config/homeGuild.js';

export const QR_LINK = 'https://guns.lol/0skar';
export const QR_FILE = new URL('../../assets/qr-guns-lol.png', import.meta.url);
export const QR_COOLDOWN_MS = 10_000;

const QR_WORD = /^[^\p{L}\p{N}\s]{0,3}qr$/iu;
const lastReply = new Map(); // guildId:userId -> time

/** Whether `text` is just "qr". */
export function isQrRequest(text) {
    return QR_WORD.test(String(text || '').trim());
}

/** Sends the QR code. Returns true when it did. */
export async function handleQr(message, { now = Date.now() } = {}) {
    if (!message.guild || message.author?.bot || !isHomeGuild(message.guild.id)) return false;
    if (!isQrRequest(message.content)) return false;
    const key = `${message.guild.id}:${message.author.id}`;
    if (now - (lastReply.get(key) ?? -Infinity) < QR_COOLDOWN_MS) return false;
    lastReply.set(key, now);
    await message.reply({
        content: QR_LINK,
        files: [new AttachmentBuilder(fileURLToPath(QR_FILE), { name: 'qr.png' })],
        allowedMentions: { repliedUser: false },
    }).catch(() => {});
    return true;
}
