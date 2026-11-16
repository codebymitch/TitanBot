import { SlashCommandBuilder } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { createError, ErrorTypes, withErrorHandling } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { validateDiscordId } from '../../utils/validation.js';
import EconomyService from '../../services/economyService.js';

const MAX_AUTOCOMPLETE_FETCHES = 10;
const AUTOCOMPLETE_FETCH_TIMEOUT_MS = 1500;

/**
 * List servers the invoker shares with the bot, excluding the current one.
 * Membership is checked cache-first; a bounded, time-limited batch fetch covers
 * servers whose member list is not (fully) cached.
 */
async function resolveMemberGuilds(client, userId, sourceGuildId, query) {
    const candidates = [...client.guilds.cache.values()].filter((guild) => guild.id !== sourceGuildId);

    const memberGuilds = [];
    const uncached = [];

    for (const guild of candidates) {
        if (guild.members.cache.has(userId)) {
            memberGuilds.push(guild);
        } else {
            uncached.push(guild);
        }
    }

    if (uncached.length > 0) {
        const fetchBatch = Promise.all(
            uncached.slice(0, MAX_AUTOCOMPLETE_FETCHES).map(async (guild) => {
                const member = await guild.members.fetch(userId).catch(() => null);
                return member ? guild : null;
            })
        );

        const timeout = new Promise((resolve) => setTimeout(() => resolve([]), AUTOCOMPLETE_FETCH_TIMEOUT_MS));
        const fetched = await Promise.race([fetchBatch, timeout]);
        memberGuilds.push(...fetched.filter(Boolean));
    }

    const normalizedQuery = String(query || '').toLowerCase().trim();

    return memberGuilds
        .filter((guild) =>
            !normalizedQuery
            || guild.name.toLowerCase().includes(normalizedQuery)
            || guild.id.startsWith(normalizedQuery))
        .slice(0, 25);
}

export default {
    slashOnly: true,

    data: new SlashCommandBuilder()
        .setName('servertransfer')
        .setDescription('Move your wallet and bank balance from this server to another server you are in')
        .addStringOption((option) =>
            option
                .setName('server')
                .setDescription('Destination server to move your balance to')
                .setRequired(true)
                .setAutocomplete(true)
        ),

    async autocomplete(interaction, client) {
        try {
            const focused = interaction.options.getFocused(true);
            if (focused.name !== 'server') {
                await interaction.respond([]);
                return;
            }

            const guilds = await resolveMemberGuilds(
                client,
                interaction.user.id,
                interaction.guildId,
                focused.value
            );

            await interaction.respond(
                guilds.map((guild) => ({ name: guild.name.slice(0, 100), value: guild.id }))
            );
        } catch (error) {
            logger.error('Error handling servertransfer autocomplete:', {
                error: error.message,
                userId: interaction.user?.id,
                guildId: interaction.guildId
            });
            await interaction.respond([]).catch(() => {});
        }
    },

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const sourceGuildId = interaction.guildId;
        const rawServer = interaction.options.getString('server', true);
        const destGuildId = validateDiscordId(String(rawServer || '').trim(), 'destinationServerId');

        if (!destGuildId) {
            throw createError(
                "Invalid destination server",
                ErrorTypes.VALIDATION,
                "Please pick a valid destination server from the list.",
                { userId, sourceGuildId, provided: rawServer }
            );
        }

        if (destGuildId === sourceGuildId) {
            throw createError(
                "Destination equals source server",
                ErrorTypes.VALIDATION,
                "That is this server. Choose a different destination server.",
                { userId, sourceGuildId }
            );
        }

        const destGuild = client.guilds.cache.get(destGuildId);
        if (!destGuild) {
            throw createError(
                "Bot not in destination server",
                ErrorTypes.VALIDATION,
                "I'm not in that server, so I can't move your balance there.",
                { userId, destGuildId }
            );
        }

        const destMember = await destGuild.members.fetch(userId).catch(() => null);
        if (!destMember) {
            throw createError(
                "User not in destination server",
                ErrorTypes.VALIDATION,
                "You need to be a member of the destination server first.",
                { userId, destGuildId }
            );
        }

        const result = await EconomyService.transferServerBalance(client, sourceGuildId, destGuildId, userId);
        const movedTotal = result.walletMoved + result.bankMoved;

        const embed = successEmbed(
            'Balance Moved',
            `Your balance from **${interaction.guild?.name ?? 'this server'}** has been moved to **${destGuild.name}**.`
        ).addFields(
            { name: 'Total Moved', value: `$${movedTotal.toLocaleString()}`, inline: true },
            { name: 'Sent as Cash', value: `$${result.walletMoved.toLocaleString()}`, inline: true },
            { name: 'Sent as Bank', value: `$${result.bankMoved.toLocaleString()}`, inline: true },
            {
                name: `Balance here (${interaction.guild?.name ?? 'this server'})`,
                value: `$${result.sourceWallet.toLocaleString()} cash · $${result.sourceBank.toLocaleString()} bank`,
                inline: true,
            },
            {
                name: `Balance in ${destGuild.name}`,
                value: `$${result.destWallet.toLocaleString()} cash · $${result.destBank.toLocaleString()} bank`,
                inline: true,
            }
        );

        if (result.bankOverflow > 0) {
            embed.addFields({
                name: 'Bank Capacity Note',
                value: `**$${result.bankOverflow.toLocaleString()}** did not fit in your bank there, so it arrived as cash instead.`,
            });
        }

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

        logger.info(`[ECONOMY] Cross-server balance transfer completed`, {
            userId,
            sourceGuildId,
            destGuildId,
            movedTotal
        });
    }, { command: 'servertransfer' })
};
