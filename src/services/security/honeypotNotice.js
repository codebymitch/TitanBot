import { logger } from '../../utils/logger.js';
import { findBoardMessage, rememberBoardMessage } from '../../utils/boardMessage.js';
import { isHomeGuild } from '../../config/homeGuild.js';

// The notice in #dont-type-here (owner's request), in our server only. That room is a trap for hacked
// accounts: whoever writes there is banned by the security bot, so a real member never writes there but a
// hacked account spamming every room does. The bot posts this notice once, pins it, and edits the same
// message on later startups; it never writes anything else there.
export const HONEYPOT_CHANNEL_NAME = 'dont-type-here';
const BOARD_KEY = 'honeypotNotice';
const FOOTER = 'روم الحماية من الاختراق';

export function buildHoneypotNotice() {
    return {
        color: 0xe74c3c,
        title: '🚫 ممنوع الكتابة في الروم ده نهائياً 🚫',
        description: [
            'أي حد هيكتب هنا هياخد **بان على طول** من غير أي تحذير.',
            '',
            '**ليه الروم ده موجود؟**',
            'لما حساب حد بيتهكر، الهاكر بيبعت لينكات نصب في كل الرومات عشان يوقع ناس تانية.',
            'الشخص الطبيعي عمره ما هيكتب هنا، إنما الهاكر هيكتب.',
            'فلما يكتب هنا، الحساب المتهكر بياخد بان على طول قبل ما يأذي حد في السيرفر.',
            '',
            '**لو حسابك اتهكر واتبندت بسبب كده:**',
            'رجّع حسابك، وغيّر الباسورد، وفعّل التحقق بخطوتين (2FA)، وبعدين كلّم الإدارة وهترجعلك.',
            '',
            '🔒 خليك في أمان: متدوسش على لينكات غريبة، ومتديش كود حسابك لأي حد.',
        ].join('\n'),
        footer: { text: FOOTER },
    };
}

const isNotice = (message) => message.embeds?.[0]?.footer?.text === FOOTER;

/** Posts (or edits) and pins the notice in #dont-type-here. Returns `{ status }`. */
export async function publishHoneypotNotice(client) {
    for (const guild of client.guilds.cache.values()) {
        if (!isHomeGuild(guild.id)) continue;
        const channel = guild.channels.cache.find((entry) => entry.name === HONEYPOT_CHANNEL_NAME && entry.isTextBased?.());
        if (!channel) return { status: 'missing-channel' };
        const payload = { embeds: [buildHoneypotNotice()], allowedMentions: { parse: [] } };
        const isOwn = (message) => message.author?.id === client.user.id && isNotice(message);
        const existing = await findBoardMessage(channel, BOARD_KEY, isOwn).catch(() => null);
        if (existing) {
            await existing.edit(payload);
            if (!existing.pinned) await existing.pin().catch(() => {});
            return { status: 'updated' };
        }
        const sent = await channel.send(payload);
        await rememberBoardMessage(channel, BOARD_KEY, sent.id);
        await sent.pin().catch((error) => logger.warn(`Could not pin the honeypot notice: ${error.message}`));
        return { status: 'sent' };
    }
    return { status: 'skipped' };
}
