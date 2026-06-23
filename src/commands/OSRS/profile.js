import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData } from '../../utils/economy.js';
import { getPvpStats, getRecentPvpEvents } from '../../utils/database/pvp.js';
import { getOsrsLinksKey, getOsrsLinksPrefix } from '../../utils/database/keys.js';
import {
    normalizeLinkedOsrsUsernames,
    formatProfileCurrency,
    buildLinkedRsnsValue,
    buildFightStats,
    buildRecentActivityRows,
} from '../../utils/osrsProfile.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

function formatUpdatedFooter(date = new Date()) {
    const iso = date.toISOString().replace('T', ' ').slice(0, 16);
    return `Last updated: ${iso} UTC`;
}

async function getMemberForProfile(interaction, targetUser) {
    if (interaction.member?.user?.id === targetUser.id) {
        return interaction.member;
    }

    return interaction.guild?.members?.fetch(targetUser.id).catch(() => null);
}

async function getAllLinkedRsnMappings(client, guildId) {
    if (!client?.db || typeof client.db.list !== 'function' || typeof client.db.get !== 'function') {
        return {};
    }

    const rsnToUserId = {};
    const keys = await client.db.list(getOsrsLinksPrefix(guildId));

    for (const key of keys) {
        const userId = key.split(':').pop();
        const usernames = normalizeLinkedOsrsUsernames(await client.db.get(key, []));

        for (const username of usernames) {
            rsnToUserId[username.toLowerCase()] = userId;
        }
    }

    return rsnToUserId;
}

export default {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('View an OSRS staking profile with linked accounts, balances, and fight stats')
        .addUserOption((option) =>
            option
                .setName('user')
                .setDescription('The member whose profile you want to view')
                .setRequired(false),
        )
        .setDMPermission(false),

    execute: withErrorHandling(async (interaction, _config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const guildId = interaction.guildId;
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const member = await getMemberForProfile(interaction, targetUser);

        if (!member) {
            throw createError(
                'Target user is not in server',
                ErrorTypes.VALIDATION,
                'That Discord user is not currently in this server.',
            );
        }

        const rawLinks = await client.db.get(getOsrsLinksKey(guildId, targetUser.id), []);
        const linkedUsernames = normalizeLinkedOsrsUsernames(rawLinks);
        const economyData = await getEconomyData(client, guildId, targetUser.id);
        const recentEvents = await getRecentPvpEvents(guildId);

        const statsByUsername = {};
        for (const username of linkedUsernames) {
            statsByUsername[username.toLowerCase()] = await getPvpStats(guildId, username);
        }

        const fightStats = buildFightStats(linkedUsernames, statsByUsername, recentEvents);
        const rsnToUserId = await getAllLinkedRsnMappings(client, guildId);
        const recentActivityRows = buildRecentActivityRows(recentEvents, linkedUsernames, rsnToUserId, 5);

        const createdAt = Math.floor(targetUser.createdAt.getTime() / 1000);
        const discordUsername = targetUser.username || targetUser.globalName || 'Unknown User';
        const embed = createEmbed({
            title: `${discordUsername}'s OSRS Profile`,
            description: linkedUsernames.length === 0
                ? '⚠️ No linked OSRS accounts found for this member yet.'
                : 'Comprehensive staking profile overview.',
            color: 'primary',
            fields: [
                {
                    name: '👤 User Info',
                    value: [
                        `**Username:** ${discordUsername}`,
                        `**Mention:** ${targetUser}`,
                        `**Created:** <t:${createdAt}:F>`,
                    ].join('\n'),
                    inline: false,
                },
                {
                    name: '💰 Wallet / Balance',
                    value: [
                        `**Wallet:** ${formatProfileCurrency(economyData.wallet || 0)}`,
                        `**Vault:** ${formatProfileCurrency(economyData.bank || 0)}`,
                    ].join('\n'),
                    inline: true,
                },
                {
                    name: '🎮 Linked RSNs',
                    value: buildLinkedRsnsValue(linkedUsernames),
                    inline: true,
                },
                {
                    name: '⚔️ Fight Stats',
                    value: [
                        `**Total Fights:** ${fightStats.totalFights}`,
                        `**Wins:** ${fightStats.wins}`,
                        `**Losses:** ${fightStats.losses}`,
                        `**Win Rate:** ${fightStats.winRate}%`,
                        `**Current Streak:** ${fightStats.currentStreak}`,
                    ].join('\n'),
                    inline: false,
                },
                {
                    name: '🕒 Recent Activity',
                    value: recentActivityRows.length > 0
                        ? recentActivityRows.join('\n')
                        : 'No recent fights recorded.',
                    inline: false,
                },
            ],
            footer: { text: formatUpdatedFooter() },
        });

        embed.setThumbnail(targetUser.displayAvatarURL({ size: 256 }));

        logger.info('[OSRS] Profile requested', {
            guildId,
            targetUserId: targetUser.id,
            requestedBy: interaction.user.id,
            linkedAccounts: linkedUsernames.length,
            fightsShown: recentActivityRows.length,
        });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'profile' }),
};
