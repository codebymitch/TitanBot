// chatFilterService.js — automatic punishment for insults and banned words (reports #146, #147, #151).
//
// Each rule has a punishment, from the strongest:
//   • kosomak   — "كسمك" and anything with the same meaning, even hidden ("ك س م ك", "كـسـمـك",
//                 "kosomak", "k$mk"): message deleted + 1 hour timeout.
//   • ibnAl     — "ابن ال..." with any word ("ابن الكلب", "يا ابن ال...", "ebn el ..."): message deleted
//                 + a warning (the owner changed it from a 15 minute timeout). A few friendly phrases
//                 are left alone (IBN_AL_ALLOWED).
//   • insult    — strong insults (INSULTS below): message deleted + a warning (3 warnings = timeout).
//   • banned    — words that are only deleted, with no punishment ("الحفره").
// Owners, trusted staff (the Anti-Nuke trusted list, members or roles), bots and the report channel
// (reports quote insults) are never checked. Edit the lists
// below to add or remove words.

import { isServerOwner } from '../../config/serverOwners.js';
import { canLiftHardBan } from './hardBanService.js';
import { REPORT_CHANNEL_ID } from '../reportChannelService.js';
import { issueWarning } from './warnEscalation.js';
import { sendModerationActionLog } from './moderationActionLogService.js';
import { logger } from '../../utils/logger.js';

const NOTICE_DELETE_MS = 5_000;
const HOUR = 60 * 60_000;

// "ابن ال..." phrases that are not insults.
export const IBN_AL_ALLOWED = ['الحلال', 'الناس', 'الاصول', 'العم', 'الخال', 'البلد', 'الجيران', 'الحته', 'الحاره'];

// Strong insults (after normalisation: ة→ه, أ/إ/آ→ا, ى→ي, repeated letters collapsed).
// Each is matched as a whole word, with optional prefixes (يا، و، ف، ب، ال) and the listed endings.
const ENDINGS = '(?:ك|كو|كم|ه|ها|هم|ين|ات|اك)?';
export const INSULTS = [
    'شرموط', 'شرموطه', 'شراميط',
    'متناك', 'متناكه', 'منيوك', 'منيوكه', 'نيك', 'انيك', 'هنيك', 'اتناك',
    'خول', 'خولات',
    'عرص', 'معرص', 'معرصين', 'عرصه',
    'زبي', 'زبر', 'زب',
    'طيز',
    'لبوه', 'قحبه', 'قحاب',
    'ديوث',
];
const INSULTS_LATIN = ['sharmot', 'sharmota', 'metnak', 'mitnak', 'metnaka', 'manyok', 'manyak', 'khawal', 'a3ars', '3ars', 'm3ars', 'zobr', 'zeby', 'teez', 'tez', 'labwa', 'a7ba'];

// Deleted with no punishment.
export const BANNED_WORDS = [/(?<!\p{L})ال\s?حفره(?!\p{L})/u, /(?<![a-z])[ae]l\s?7ofr?a(?![a-z])/u];

const RULES = {
    // The owner's own reply for this one, instead of the usual notice.
    kosomak: { label: 'شتيمة (كسمك)', timeoutMs: HOUR, reply: (userId) => `<@${userId}> كسمين امك خد تايم يبنالمتناكه` },
    ibnAl: { label: 'شتيمة (ابن ال...)', warn: true },
    insult: { label: 'شتيمة', warn: true },
    banned: { label: 'كلمة ممنوعة' },
};

/** The text as the filter reads it: lowercase, no tashkeel/tatweel/invisible chars, one letter shape, no repeats. */
export function normalizeForFilter(text) {
    let s = String(text || '').toLowerCase()
        .replace(/[ً-ٰٟـ​-‏‪-‮⁠﻿]/gu, '')
        .replace(/[أإآٱ]/gu, 'ا')
        .replace(/ة/gu, 'ه')
        .replace(/ى/gu, 'ي')
        .replace(/ؤ/gu, 'و')
        .replace(/ئ/gu, 'ي');
    // Letters hidden with symbols between them ("ك.س.م.ك", "ك س م ك", "k-o-s"): tokens of one or two
    // letters in a row are glued back together.
    const tokens = s.split(/[^\p{L}\p{N}$@]+/u).filter(Boolean);
    const glued = [];
    let run = '';
    for (const token of tokens) {
        if (token.length <= 2) {
            run += token;
            continue;
        }
        if (run) glued.push(run);
        run = '';
        glued.push(token);
    }
    if (run) glued.push(run);
    s = glued.join(' ');
    // Stretched letters: "كسسسمك" → "كسمك", "khawaaal" → "khawal".
    return s.replace(/(\p{L})\1+/gu, '$1');
}

function latinOf(text) {
    return text.replace(/\$/gu, 's').replace(/0/gu, 'o').replace(/@/gu, 'a');
}

const START = '(?<!\\p{L})';
const END = '(?!\\p{L})';
const PREFIX = '(?:يا\\s?|و|ف|ب|ال|وال|بال|يال)?';

const KOSOMAK_PATTERNS = [
    new RegExp(`${START}${PREFIX}كس\\s?(?:ا|و)?\\s?م`, 'u'), // كسمك، كس امك، كسم، كسومك، كس م
    new RegExp(`${START}${PREFIX}كس\\s?ا?خت`, 'u'), // كس اختك، كسختك
    new RegExp(`${START}${PREFIX}كس\\s?ابو`, 'u'), // كس ابوك
    /(?<![a-z])k[ou]?s+\s?[ou]?m+(?:[ao]k|k|ak)?(?![a-z]{2})/u, // ksmk, kosomak, kos omak, k$mk
    /(?<![a-z])k[ou]?s+\s?[ou]?(?:5|kh)t/u, // kos o5tak
];

// "ابن ال" + a word, or with the word hidden ("ابن ال***"): the captured word is empty then.
const IBN_AL_ARABIC = new RegExp(`${START}(?:يا\\s?)?ا?بن\\s?ال(\\p{L}*)`, 'gu');
const IBN_AL_LATIN = /(?<![a-z])(?:ya\s?)?[ie]?bn\s?[ae]l\s?[a-z0-9]{2,}/u;

const INSULT_PATTERN = new RegExp(`${START}${PREFIX}((?:${INSULTS.join('|')})${ENDINGS})${END}`, 'gu');
// Real words and names that look like an insult with an ending ("خوله" is the name Khawla).
const NOT_INSULTS = new Set(['خوله']);
const INSULT_LATIN_PATTERN = new RegExp(`(?<![a-z0-9])(?:ya\\s?)?(?:${INSULTS_LATIN.join('|')})(?:ak|ek|a|ين)?(?![a-z0-9])`, 'u');

function hasIbnAl(text) {
    for (const match of text.matchAll(IBN_AL_ARABIC)) {
        if (!match[1] || !IBN_AL_ALLOWED.includes(`ال${match[1]}`)) return true;
    }
    return IBN_AL_LATIN.test(latinOf(text));
}

/** The strongest rule the text breaks ('kosomak', 'ibnAl', 'insult', 'banned'), or null. */
export function checkText(text) {
    const normalized = normalizeForFilter(text);
    if (!normalized) return null;
    const latin = latinOf(normalized);
    if (KOSOMAK_PATTERNS.some((pattern) => pattern.test(normalized) || pattern.test(latin))) return 'kosomak';
    if (hasIbnAl(normalized)) return 'ibnAl';
    if ([...normalized.matchAll(INSULT_PATTERN)].some((match) => !NOT_INSULTS.has(match[1])) || INSULT_LATIN_PATTERN.test(latin)) return 'insult';
    if (BANNED_WORDS.some((pattern) => pattern.test(normalized) || pattern.test(latin))) return 'banned';
    return null;
}

async function notice(message, text) {
    const sent = await message.channel.send({ content: text, allowedMentions: { users: [message.author.id] } }).catch(() => null);
    if (sent) setTimeout(() => sent.delete().catch(() => {}), NOTICE_DELETE_MS).unref?.();
}

/** Deletes and punishes a message that breaks a rule. Returns true when the message was handled. */
export async function handleChatFilter(message) {
    if (!message.guild || message.author?.bot || isServerOwner(message.author?.id)) return false;
    // Reports quote what someone else said, so the report channel is never filtered.
    if (message.channelId === REPORT_CHANNEL_ID) return false;
    const ruleName = checkText(message.content);
    if (!ruleName) return false;
    // Trusted staff (the Anti-Nuke trusted list: members or roles) may swear.
    if (await canLiftHardBan(message.guild, message.author.id).catch(() => false)) return false;
    const rule = RULES[ruleName];

    await message.delete().catch(() => {});
    const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
    const me = message.guild.members.me;
    const reason = `فلتر الشات: ${rule.label}`;
    let punishment = '🗑️ الرسالة اتمسحت';

    try {
        if (rule.timeoutMs && member?.moderatable) {
            await member.timeout(rule.timeoutMs, reason);
            punishment = `⏳ تايم ${rule.timeoutMs >= HOUR ? 'ساعة' : `${rule.timeoutMs / 60_000} دقيقة`}`;
            await sendModerationActionLog(message.guild, { action: 'timeout', targetUser: message.author, moderatorUser: message.client.user, reason, durationMs: rule.timeoutMs, channel: message.channel, repliedMessage: message });
        } else if (rule.warn && member && me) {
            const result = await issueWarning({ guild: message.guild, member, moderator: me, reason });
            punishment = `⚠️ وارن (${result.totalCount})${result.timeoutApplied ? ' + تايم' : ''}`;
            await sendModerationActionLog(message.guild, { action: 'warn', targetUser: message.author, moderatorUser: message.client.user, reason, warnings: result.totalCount, channel: message.channel, repliedMessage: message });
        }
    } catch (error) {
        logger.warn(`Chat filter could not punish ${message.author.id}: ${error.message}`);
    }

    await notice(message, rule.reply ? rule.reply(message.author.id) : `🚫 <@${message.author.id}> ${rule.label} ممنوعة هنا ・ ${punishment}`);
    return true;
}
