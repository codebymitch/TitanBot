import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, addMoney, removeMoney, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { MessageTemplates } from '../../utils/messageTemplates.js';
import EconomyService from '../../services/economyService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('giveall')
        .setDescription('Give money to all server members (Owner/Admin only)')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Amount to give to each member')
                .setRequired(true)
                .setMinValue(0)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction, true);
        if (!deferred) return;

        const executorId = interaction.user.id;
        const amount = interaction.options.getInteger("amount");
        const guildId = interaction.guildId;

        // Check if user is a bot owner
        const ownerIds = config.commands.owners || [1022692130512191518];
        const isOwner = ownerIds.includes(1022692130512191518);
        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);

        if (!isOwner && !isAdmin) {
            throw createError(
                "Permission denied",
                ErrorTypes.VALIDATION,
                "Only bot owners and server administrators can use this command.",
                { userId: executorId, guildId }
            );
        }

        if (amount <= 0) {
            throw createError(
                "Invalid amount",
                ErrorTypes.VALIDATION,
                "Amount must be greater than zero.",
                { amount }
            );
        }

        logger.debug(`[ECONOMY] GiveAll command initiated`, {
            executorId,
            amount,
            guildId
        });

        try {
            // Fetch all members
            const guild = interaction.guild;
            if (!guild) {
                throw createError(
                    "Guild not found",
                    ErrorTypes.VALIDATION,
                    "Could not find the server.",
                    { guildId }
                );
            }

            await InteractionHelper.safeEditReply(interaction, {
                content: `⏳ Processing giveaway to **${guild.memberCount}** members...`
            });

            // Fetch all members from the guild
            const members = await guild.members.fetch({ limit: 0 });
            const memberIds = members
                .filter(m => !m.user.bot) // Exclude bots
                .map(m => m.user.id);

            logger.info(`[ECONOMY] Starting money distribution`, {
                executorId,
                memberCount: memberIds.length,
                amountPerMember: amount,
                guildId
            });

            let successCount = 0;
            let failureCount = 0;
            const errors = [];

            // Process each member in batches to avoid rate limiting
            const batchSize = 10;
            for (let i = 0; i < memberIds.length; i += batchSize) {
                const batch = memberIds.slice(i, i + batchSize);

                await Promise.all(
                    batch.map(async (memberId) => {
                        try {
                            // Get member's current economy data
                            const memberData = await getEconomyData(client, guildId, memberId);

                            if (!memberData) {
                                failureCount++;
                                return;
                            }

                            // Add money to member's wallet
                            const newWallet = memberData.wallet + amount;
                            memberData.wallet = newWallet;

                            // Update the economy data
                            await setEconomyData(client, guildId, memberId, memberData);

                            successCount++;
                        } catch (err) {
                            failureCount++;
                            errors.push(`${memberId}: ${err.message}`);
                            logger.warn(`Failed to give money to ${memberId}`, { error: err.message });
                        }
                    })
                );
            }

            const embed = MessageTemplates.SUCCESS.DATA_UPDATED(
                "giveall",
                `Successfully distributed **$${amount.toLocaleString()}** to **${successCount}** members!`
            )
                .addFields(
                    {
                        name: "✅ Successful",
                        value: `${successCount} members`,
                        inline: true,
                    },
                    {
                        name: "❌ Failed",
                        value: `${failureCount} members`,
                        inline: true,
                    },
                    {
                        name: "💵 Amount Per Member",
                        value: `$${amount.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "👥 Total Members Processed",
                        value: `${memberIds.length}`,
                        inline: true,
                    }
                )
                .setFooter({
                    text: `Executed by ${interaction.user.username}`,
                    iconURL: interaction.user.displayAvatarURL(),
                });

            if (errors.length > 0 && errors.length <= 5) {
                embed.addFields({
                    name: "⚠️ Error Details",
                    value: errors.join("\n").substring(0, 1024)
                });
            }

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

            logger.info(`[ECONOMY] GiveAll completed`, {
                executorId,
                successCount,
                failureCount,
                totalAmount: successCount * amount,
                guildId
            });

        } catch (err) {
            logger.error(`[ECONOMY] GiveAll command failed`, {
                error: err.message,
                executorId,
                guildId
            });
            throw err;
        }
    }, { command: 'giveall' })
};
