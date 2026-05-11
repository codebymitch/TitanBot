import { logger } from '../utils/logger.js';

// In-memory map so >bancheck can read remaining time: Map<`${guildId}_${userId}`, { timerId, unbanAt }>
export const tempBanTimers = new Map();

const DB_KEY = (guildId) => `guild:${guildId}:tempbans`;

const MAX_ST = 2_147_483_647;
function safeTimeout(fn, ms) {
    if (ms <= MAX_ST) return setTimeout(fn, ms);
    return setTimeout(() => safeTimeout(fn, ms - MAX_ST), MAX_ST);
}

async function executeUnban(client, guildId, userId, reason) {
    const key = `${guildId}_${userId}`;
    tempBanTimers.delete(key);
    await removeTempban(client, guildId, userId);
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    await guild.members.unban(userId, reason).catch(() => {});
    logger.info(`Tempban expired for ${userId} in ${guildId}`);

    // DM the user a rejooin invite now that the ban is lifted
    try {
        const user = await client.users.fetch(userId).catch(() => null);
        if (!user) return;
        const inviteChannel = guild.systemChannel
            ?? guild.channels.cache.find(c => c.type === 0 && c.permissionsFor(guild.members.me)?.has('CreateInstantInvite'));
        const invite = inviteChannel
            ? await guild.invites.create(inviteChannel, { maxAge: 0, maxUses: 1, reason: 'Tempban expired rejoin invite' }).catch(() => null)
            : null;
        const { EmbedBuilder } = await import('discord.js');
        const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle(`✅ Your ban in ${guild.name} has expired`)
            .setDescription('You are welcome to rejoin the server.')
            .setTimestamp();
        if (invite) embed.addFields({ name: '🔗 Rejoin', value: `https://discord.gg/${invite.code}` });
        await user.send({ embeds: [embed] });
    } catch {}
}

function setTimer(client, guildId, userId, ms, unbanAt) {
    const key = `${guildId}_${userId}`;
    if (tempBanTimers.has(key)) clearTimeout(tempBanTimers.get(key).timerId);
    const timerId = safeTimeout(() => executeUnban(client, guildId, userId, 'Tempban expired'), ms);
    tempBanTimers.set(key, { timerId, unbanAt });
}

export async function scheduleTempBan(client, guildId, userId, ms, reason) {
    const unbanAt = Date.now() + ms;
    // Persist to DB
    const entries = await client.db.get(DB_KEY(guildId), []);
    const filtered = entries.filter(e => e.userId !== userId);
    filtered.push({ userId, unbanAt, reason });
    await client.db.set(DB_KEY(guildId), filtered);
    // Schedule in-memory timer
    setTimer(client, guildId, userId, ms, unbanAt);
}

export async function cancelTempBan(client, guildId, userId) {
    const key = `${guildId}_${userId}`;
    if (tempBanTimers.has(key)) {
        clearTimeout(tempBanTimers.get(key).timerId);
        tempBanTimers.delete(key);
    }
    await removeTempban(client, guildId, userId);
}

async function removeTempban(client, guildId, userId) {
    const entries = await client.db.get(DB_KEY(guildId), []);
    await client.db.set(DB_KEY(guildId), entries.filter(e => e.userId !== userId));
}

export async function loadAndScheduleTempBans(client) {
    let restored = 0;
    for (const [guildId] of client.guilds.cache) {
        try {
            const entries = await client.db.get(DB_KEY(guildId), []);
            for (const entry of entries) {
                const remaining = entry.unbanAt - Date.now();
                if (remaining <= 0) {
                    // Already expired while bot was offline — unban now
                    await executeUnban(client, guildId, entry.userId, 'Tempban expired (caught on restart)');
                } else {
                    setTimer(client, guildId, entry.userId, remaining, entry.unbanAt);
                    restored++;
                }
            }
        } catch (err) {
            logger.error(`Failed to restore tempbans for guild ${guildId}:`, err);
        }
    }
    if (restored > 0) logger.info(`Restored ${restored} tempban timer(s) from DB`);
}
