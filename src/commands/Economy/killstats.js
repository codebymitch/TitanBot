import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData } from '../../utils/economy.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ensureMurderFields, getRankForXp, getNextRank, MURDER_RANKS } from '../../utils/murder.js';

export default {
    data: new SlashCommandBuilder()
        .setName('killstats')
        .setDescription("View a player's murder rank, kills, deaths, and progress.")
        .setDMPermission(false)
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to view (defaults to you)')
                .setRequired(false)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const target = interaction.options.getUser('user') || interaction.user;
        const guildId = interaction.guildId;

        const data = await getEconomyData(client, guildId, target.id);
        ensureMurderFields(data);

        const xp = data.murderXp || 0;
        const rank = getRankForXp(xp);
        const next = getNextRank(xp);
        const kills = data.kills || 0;
        const deaths = data.deaths || 0;
        const kd = (kills / Math.max(1, deaths)).toFixed(2);

        // Build a simple progress bar for next rank
        let progressLine = '**MAX RANK**';
        if (next) {
            const span = next.minXp - rank.minXp;
            const into = xp - rank.minXp;
            const pct = Math.max(0, Math.min(1, into / span));
            const filled = Math.round(pct * 12);
            const bar = '█'.repeat(filled) + '░'.repeat(12 - filled);
            progressLine = `\`${bar}\` ${into}/${span} XP → **${next.name}**`;
        }

        const embed = createEmbed({
            title: `🔪 Kill Stats — ${target.username}`,
            description:
                `**Rank:** ${rank.name}\n` +
                `**Murder XP:** ${xp.toLocaleString()}\n` +
                `${progressLine}`,
            color: 0xb00020,
        })
            .setThumbnail(target.displayAvatarURL())
            .addFields(
                { name: '💀 Kills', value: kills.toLocaleString(), inline: true },
                { name: '⚰️ Deaths', value: deaths.toLocaleString(), inline: true },
                { name: '📊 K/D', value: kd, inline: true },
                { name: '🔥 Current Streak', value: String(data.killStreak || 0), inline: true },
                { name: '🏆 Best Streak', value: String(data.bestKillStreak || 0), inline: true },
                { name: '💰 Base Payout', value: `$${rank.payoutMin.toLocaleString()} – $${rank.payoutMax.toLocaleString()}`, inline: true },
            )
            .setFooter({ text: `Tiers: ${MURDER_RANKS.map(r => r.name).join(' → ')}` });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'killstats' })
};
