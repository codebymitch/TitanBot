// gamesBotWins.js — pays CC for wins in the games bot (Clover).
//
// When a Clover group game ends it posts the winner as `👑 | @winner` (with a winner card image), and
// a solo answer game posts `✅ | قام @member بكتابة الاجابة الصحيحة خلال 4.12 ثانية`. This reads those
// messages and pays the winner (gamesBotReward in config/cc.js: more in our server), capped per day only while the CC event runs (config/cc.js). Only
// messages from the games bot IDs count (config/games.js), so members can't fake a win by typing
// the same text, and each message pays once.

import { gamesBotIds } from '../../config/games.js';
import { CC, formatCC, ccBoostLine, gamesBotDailyCap } from '../../config/cc.js';
import { awardGamesBotWin } from './ccService.js';
import { logger } from '../../utils/logger.js';

// `👑 | <@id>`: the crown, an optional bar, one mention and nothing else.
const WIN_MESSAGE = /^\s*👑️?\s*\|?\s*<@!?(\d{17,20})>\s*$/u;
// `✅ | قام <@id> بكتابة الاجابة الصحيحة خلال **__4.12__** ثانية`: the first member to type the answer.
const ANSWER_MESSAGE = /^\s*(?:✅️?|<a?:\w+:\d+>)?\s*\|?\s*قام\s+<@!?(\d{17,20})>\s+بكتابة\s+ال[اإأ]جابة\s+الصحيحة/u;
const NOTICE_DELETE_MS = 15_000;
const PAID_MEMORY = 500;
const paidMessages = new Set();

/** `{ userId, kind }` when `content` is a games bot win message ('group' or 'answer'), otherwise null. */
export function parseWin(content) {
    const text = String(content || '');
    const group = WIN_MESSAGE.exec(text)?.[1];
    if (group) return { userId: group, kind: 'group' };
    const answer = ANSWER_MESSAGE.exec(text)?.[1];
    return answer ? { userId: answer, kind: 'answer' } : null;
}

// Clover often puts the result in an embed or a components v2 box (the coloured box under the answer),
// not in the message text, so every text in the message is read: content, embed title / description /
// fields, and the text of its components.
function componentTexts(component, texts) {
    if (!component || typeof component !== 'object') return;
    if (Array.isArray(component)) {
        for (const child of component) componentTexts(child, texts);
        return;
    }
    if (typeof component.content === 'string') texts.push(component.content);
    componentTexts(component.components, texts);
    componentTexts(component.component, texts);
    componentTexts(component.accessory, texts);
}

export function messageTexts(message) {
    const texts = [message.content];
    for (const embed of message.embeds || []) {
        const data = embed.data || embed;
        texts.push(data.title, data.description, data.author?.name);
        for (const field of data.fields || []) texts.push(field.name, field.value);
    }
    componentTexts((message.components || []).map((component) => component.toJSON?.() || component), texts);
    return texts.filter((text) => typeof text === 'string' && text.trim());
}

/** The first win found in any of the message's texts (see messageTexts), otherwise null. */
export function parseWinMessage(message) {
    for (const text of messageTexts(message)) {
        const win = parseWin(text);
        if (win) return win;
    }
    return null;
}

/** The winner's user ID when `content` is a games bot win message, otherwise null. */
export function parseWinner(content) {
    return parseWin(content)?.userId || null;
}

function rememberPaid(messageId) {
    paidMessages.add(messageId);
    if (paidMessages.size > PAID_MEMORY) paidMessages.delete(paidMessages.values().next().value);
}

/**
 * Pays the winner of a games bot win message. Returns true when `message` was one (paid or not),
 * so the caller can stop handling it. Also called on edits (Clover may fill the result in later);
 * a message pays once either way.
 */
export async function handleGamesBotWin(message, client) {
    if (!message.guild || !message.author?.bot || !gamesBotIds().has(message.author.id)) return false;
    const win = parseWinMessage(message);
    if (!win) return false;
    const winnerId = win.userId;
    if (paidMessages.has(message.id)) return true;
    rememberPaid(message.id);

    const winner = message.mentions?.users?.get(winnerId);
    if (winner?.bot) return true;

    try {
        const { amount, balance, boost } = await awardGamesBotWin(client, message.guild.id, winnerId, { kind: win.kind });
        logger.info('[CC] Games bot win paid', { guildId: message.guild.id, userId: winnerId, kind: win.kind, amount, boost, messageId: message.id });
        // While a CC event runs the notice says so and when it ends (`🔥 CC ×5 — بيخلص بعد 4 أيام`).
        const event = ccBoostLine();
        const text = (amount > 0
            ? `🌀 <@${winnerId}> كسب +${formatCC(amount)} • رصيدك: ${formatCC(balance)}`
            : `🌀 <@${winnerId}> وصلت لحد الـ CC من الألعاب النهارده (${gamesBotDailyCap()} ${CC.short})، الفوز اتحسب في إحصائياتك.`)
            + (event ? `\n${event}` : '');
        const notice = await message.reply({ content: text, allowedMentions: { parse: [] } }).catch(() => null);
        if (notice) setTimeout(() => notice.delete().catch(() => {}), NOTICE_DELETE_MS).unref?.();
    } catch (error) {
        logger.error(`[CC] Failed to pay games bot win for ${winnerId}`, error);
    }
    return true;
}
