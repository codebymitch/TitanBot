import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getRankForXp } from '../../utils/murder.js';

export default {
    data: new SlashCommandBuilder()
        .setName('killboard')
        .setDescription("View this server's top 10 killers.")
        .setDMPermission(false),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const guildId = interaction.guildId;
        const prefix = `economy:${guildId}:`;

        let allKeys = await client.db.list(prefix);
        if (!Array.isArray(allKeys)) allKeys = [];

        if (allKeys.length === 0) {
            throw createError(
                'No data',
                ErrorTypes.VALIDATION,
                'No killer data found for this server yet. Be the first.'
            );
        }

        const players = [];
        for (const key of allKeys) {
            const userId = key.replace(prefix, '');
            const userData = await client.db.get(key);
            if (!userData) continue;
            const kills = userData.kills || 0;
            const xp = userData.murderXp || 0;
            if (kills === 0 && xp === 0) continue;
            players.push({
                userId,
                kills,
                deaths: userData.deaths || 0,
                xp,
                bestStreak: userData.bestKillStreak || 0,
            });
        }

        if (players.length === 0) {
            throw createError(
                'No kills yet',
                ErrorTypes.VALIDATION,
                'Nobody on this server has any kills yet. Open the season with `/murder @someone`.'
            );
        }

        // Sort by murderXp desc, then kills desc as tiebreaker
        players.sort((a, b) => b.xp - a.xp || b.kills - a.kills);

        const top = players.slice(0, 10);
        const myRank = players.findIndex(p => p.userId === interaction.user.id) + 1;
        const medals = ['🥇', '🥈', '🥉'];

        const lines = top.map((p, i) => {
            const rank = getRankForXp(p.xp);
            const tag = medals[i] || `**#${i + 1}**`;
            const kd = (p.kills / Math.max(1, p.deaths)).toFixed(2);
            return `${tag} <@${p.userId}> — **${rank.name}** · 💀 ${p.kills} kills · K/D ${kd} · 🔥 best ${p.bestStreak}`;
        });

        logger.info('[MURDER] Killboard generated', { guildId, count: players.length });

        const embed = createEmbed({
            title: '🔪 Server Killboard',
            description: lines.join('\n'),
            footer: `Your rank: ${myRank > 0 ? `#${myRank} of ${players.length}` : 'Unranked — get your first kill with /murder'}`,
            color: 0xb00020,
        });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'killboard' })
};
