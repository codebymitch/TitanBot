import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getEconomyData, getMaxBankCapacity } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription("Check your or someone else's balance")
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to check balance for')
                .setRequired(false)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const targetUser = interaction.options.getUser("user") || interaction.user;
            const guildId = interaction.guildId;

            logger.debug(`[ECONOMY] Balance check for ${targetUser.id}`, { userId: targetUser.id, guildId });

            if (targetUser.bot) {
                throw createError(
                    "Bot user queried for balance",
                    ErrorTypes.VALIDATION,
                    "Bots don't have an economy balance."
                );
            }

            const userData = await getEconomyData(client, guildId, targetUser.id);
            
            if (!userData) {
                throw createError(
                    "Failed to load economy data",
                    ErrorTypes.DATABASE,
                    "Failed to load economy data. Please try again later.",
                    { userId: targetUser.id, guildId }
                );
            }

            const maxBank = getMaxBankCapacity(userData);

            const wallet = typeof userData.wallet === 'number' ? userData.wallet : 0;
            const bank = typeof userData.bank === 'number' ? userData.bank : 0;

            const embed = createEmbed({
                title: `💰 ${targetUser.username}'s Balance`,
                description: `Here is the current financial status for ${targetUser.username}.`,
            })
                .addFields(
                    {
                        name: "💵 Cash",
                        value: `$${wallet.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "🏦 Bank",
                        value: `$${bank.toLocaleString()} / $${maxBank.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "💎 Total",
                        value: `$${(wallet + bank).toLocaleString()}`,
                        inline: true,
                    }
                )
                .setFooter({
                    text: `Requested by ${interaction.user.tag}`,
                    iconURL: interaction.user.displayAvatarURL(),
                });

            logger.info(`[ECONOMY] Balance retrieved`, { userId: targetUser.id, wallet, bank });

            await interaction.editReply({ embeds: [embed] });
    }, { command: 'balance' })
};




