import { logger } from '../utils/logger.js';

// AFK: `afk <reason>` marks a member away. Mentioning or replying to them tells the sender they're AFK
// (no ping), and their next message removes it. AFK members are kept in memory and saved under one key
// per server ({ userId: { reason, since } }), loaded the first time the server is needed.
const NOTICE_DELETE_MS = 8_000;
const WELCOME_BACK_DELETE_MS = 5_000;
const NICK_PREFIX = '[AFK] ';
const MAX_NICK = 32;

const afkListKey = (guildId) => `guild:${guildId}:afklist`;
const loaded = new Map(); // guildId -> Promise<Map<userId, { reason, since }>>

function loadGuild(client, guildId) {
    if (!loaded.has(guildId)) {
        loaded.set(guildId, (async () => {
            const stored = (await client.db.get(afkListKey(guildId), {}).catch(() => ({}))) || {};
            return new Map(Object.entries(stored));
        })());
    }
    return loaded.get(guildId);
}

async function save(client, guildId, afk) {
    await client.db.set(afkListKey(guildId), Object.fromEntries(afk)).catch((error) => logger.error('Failed to save AFK list:', error));
}

export async function getAfk(client, guildId, userId) {
    return (await loadGuild(client, guildId)).get(userId) || null;
}

export async function setAfk(client, member, reason) {
    const afk = await loadGuild(client, member.guild.id);
    const previous = afk.get(member.id);
    // The member's exact nickname before AFK (null = none) is saved and put back as-is when they return.
    // Running afk again while AFK keeps the first one, so "[AFK] name" is never saved as their nickname.
    const entry = { reason, since: Date.now(), nickname: previous ? previous.nickname ?? null : member.nickname ?? null, renamed: previous?.renamed || false };

    // Shows [AFK] in front of the name when the bot is allowed to change it.
    const name = member.nickname || member.user.globalName || member.user.username;
    if (!entry.renamed && member.manageable && !name.startsWith(NICK_PREFIX)) {
        entry.renamed = await member.setNickname(`${NICK_PREFIX}${name}`.slice(0, MAX_NICK), 'AFK').then(() => true).catch(() => false);
    }
    afk.set(member.id, entry);
    await save(client, member.guild.id, afk);
}

export async function clearAfk(client, member) {
    const afk = await loadGuild(client, member.guild.id);
    const entry = afk.get(member.id);
    if (!entry) return null;
    afk.delete(member.id);
    await save(client, member.guild.id, afk);
    // Only undo our own rename: if the member changed their nickname while AFK, theirs is kept.
    if (!member.manageable || !member.nickname?.startsWith(NICK_PREFIX)) return entry;
    if ('renamed' in entry) {
        if (entry.renamed) await member.setNickname(entry.nickname ?? null, 'Back from AFK').catch(() => {});
    } else {
        // AFK set before the original nickname was saved: drop the prefix from the current name.
        await member.setNickname(member.nickname.slice(NICK_PREFIX.length) || null, 'Back from AFK').catch(() => {});
    }
    return entry;
}

async function sendTemporary(channel, payload, ms) {
    const sent = await channel.send({ ...payload, allowedMentions: { parse: [] } }).catch(() => null);
    if (sent) setTimeout(() => sent.delete().catch(() => {}), ms);
}

/** The author's own AFK is removed; people they mention or reply to who are AFK are announced (no ping). */
export async function handleAfkMessage(message, client, { isAfkCommand = false } = {}) {
    try {
        const afk = await loadGuild(client, message.guild.id);

        if (!isAfkCommand && afk.has(message.author.id) && message.member) {
            const entry = await clearAfk(client, message.member);
            await sendTemporary(message.channel, { content: `👋 أهلا بيك تاني ${message.author}، شلت الـ AFK (كنت AFK <t:${Math.floor(entry.since / 1000)}:R>).` }, WELCOME_BACK_DELETE_MS);
        }

        const mentioned = new Set(message.mentions?.users?.filter((user) => !user.bot && user.id !== message.author.id).map((user) => user.id) || []);
        const repliedTo = message.mentions?.repliedUser;
        if (repliedTo && !repliedTo.bot && repliedTo.id !== message.author.id) mentioned.add(repliedTo.id);

        const lines = [...mentioned]
            .filter((userId) => afk.has(userId))
            .map((userId) => {
                const entry = afk.get(userId);
                return `💤 <@${userId}> AFK <t:${Math.floor(entry.since / 1000)}:R> — ${entry.reason}`;
            });
        if (lines.length) await sendTemporary(message.channel, { content: lines.join('\n') }, NOTICE_DELETE_MS);
    } catch (error) {
        logger.error('Error handling AFK for message:', error);
    }
}
