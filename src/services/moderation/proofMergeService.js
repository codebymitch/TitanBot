// proofMergeService.js — keeps the proof channel tidy (report #156).
//
// The bot posts every ban / timeout / warn in the moderation log channel. When the moderator who
// did it then sends the proof there (a screenshot, or what the member said), the bot deletes both
// messages and posts one message instead: the log with the proof attached (text in a field, the
// first image as the embed image, other files under it). Only the moderator's FIRST message after
// their log, within PROOF_WINDOW_MS, is taken as proof (report #164); anything after it stays a
// normal message.

import { MessageType } from 'discord.js';
import { MODERATION_ACTION_LOG_CHANNEL_ID } from './moderationActionLogService.js';
import { findBoardMessage, rememberBoardMessage } from '../../utils/boardMessage.js';
import { logger } from '../../utils/logger.js';

export const PROOF_WINDOW_MS = 10 * 60_000;
const MAX_FILES = 10;
const MAX_PROOF_TEXT = 1024;
const IMAGE = /\.(png|jpe?g|gif|webp)$/iu;

const pending = new Map(); // `${guildId}:${moderatorId}` -> { message, embed, texts, files, at }

/** Remembers the log the bot just posted for `moderatorId`, so their next proof is merged into it. */
export function rememberLogMessage(guildId, moderatorId, message, embed, now = Date.now()) {
    if (!moderatorId || !message) return;
    pending.set(`${guildId}:${moderatorId}`, { message, embed, texts: [], files: [], at: now });
}

export function buildMergedPayload(embed, texts, files) {
    const merged = { ...embed, fields: [...(embed.fields || [])] };
    const text = texts.join('\n').trim();
    if (text) merged.fields.push({ name: '📝 الدليل', value: text.slice(0, MAX_PROOF_TEXT) });
    const image = files.find((file) => IMAGE.test(file.name));
    if (image) merged.image = { url: `attachment://${image.name}` };
    if (files.length) merged.footer = { text: `📎 الدليل: ${files.length} ملف` };
    return { embeds: [merged], files: files.slice(0, MAX_FILES), allowedMentions: { parse: [] } };
}

/** Merges a moderator's proof message into their latest log. Returns true when it did. */
export async function handleProofMessage(message, { now = Date.now() } = {}) {
    if (message.channelId !== MODERATION_ACTION_LOG_CHANNEL_ID || !message.guild || message.author?.bot) return false;
    const key = `${message.guild.id}:${message.author.id}`;
    const entry = pending.get(key);
    if (!entry) return false;
    // The first message after the log decides: proof when it's in time, otherwise the log gets none.
    if (now - entry.at > PROOF_WINDOW_MS) {
        pending.delete(key);
        return false;
    }
    const attachments = [...(message.attachments?.values?.() || [])];
    if (!message.content?.trim() && !attachments.length) {
        pending.delete(key);
        return false;
    }

    // Names are made unique so two "image.png" files don't clash in attachment:// links.
    const files = [
        ...entry.files,
        ...attachments.map((file, index) => ({ attachment: file.url, name: `proof-${entry.files.length + index + 1}-${file.name}` })),
    ];
    const texts = message.content?.trim() ? [...entry.texts, message.content.trim()] : entry.texts;

    try {
        const posted = await message.channel.send(buildMergedPayload(entry.embed, texts, files));
        await entry.message.delete().catch(() => {});
        await message.delete().catch(() => {});
        // One proof per log: the moderator's next messages are normal messages.
        pending.delete(key);
        return true;
    } catch (error) {
        logger.warn(`Could not merge the proof of ${message.author.id}: ${error.message}`);
        return false;
    }
}

// The pinned "how to use this channel" card (edited on every startup, posted and pinned once).
const GUIDE_KEY = 'proofGuide';
const GUIDE_TITLE = '📌 ازاي تستخدم روم الدليل';

export function buildProofGuideEmbed() {
    return {
        color: 0x5865f2,
        title: GUIDE_TITLE,
        description: [
            'كل **بان / تايم / وارن** بيتسجل هنا لوحده.',
            '',
            '**1️⃣** اعمل العقوبة عادي (مثلاً `تايم @member 10m سبام`).',
            '**2️⃣** البوت هيبعت رسالة العقوبة هنا.',
            `**3️⃣** ابعت الدليل هنا في خلال ${PROOF_WINDOW_MS / 60_000} دقايق: صورة، أو اكتب العضو قال إيه، أو الاتنين.`,
            '**4️⃣** البوت هيمسح رسالتك ورسالة العقوبة ويبعتهم **رسالة واحدة** فيها العقوبة والدليل.',
            '',
            '📎 أول رسالة بس بعد العقوبة هي اللي بتتاخد دليل (صورة ومعاها كلام في نفس الرسالة لو عايز)، وأي رسالة بعدها بتفضل رسالة عادية.',
            '⚠️ الدليل بيتضاف لآخر عقوبة **انت** عملتها بس.',
        ].join('\n'),
    };
}

/** Posts (once) or edits the pinned guide in the proof channel. */
export async function publishProofGuide(client) {
    const channel = await client.channels.fetch(MODERATION_ACTION_LOG_CHANNEL_ID).catch(() => null);
    if (!channel?.isTextBased?.() || !channel.guild) return { status: 'missing-channel' };
    const payload = { embeds: [buildProofGuideEmbed()], allowedMentions: { parse: [] } };
    const isGuide = (message) => message.author?.id === client.user.id && message.embeds[0]?.title === GUIDE_TITLE;
    const existing = await findBoardMessage(channel, GUIDE_KEY, isGuide);
    if (existing) {
        await existing.edit(payload);
        if (!existing.pinned) await existing.pin().catch(() => {});
        return { status: 'updated' };
    }
    const sent = await channel.send(payload);
    await rememberBoardMessage(channel, GUIDE_KEY, sent.id);
    await sent.pin().catch((error) => logger.warn(`Could not pin the proof guide: ${error.message}`));
    return { status: 'sent' };
}

/** Deletes Discord's "pinned a message" notice for our own pin in the proof channel. */
export async function handleProofPinNotice(message) {
    if (message.channelId !== MODERATION_ACTION_LOG_CHANNEL_ID || message.type !== MessageType.ChannelPinnedMessage) return false;
    if (message.author?.id === message.client?.user?.id) await message.delete().catch(() => {});
    return true;
}
