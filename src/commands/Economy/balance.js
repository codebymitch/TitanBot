import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, getMaxBankCapacity, formatCurrency } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// Use Unicode escape to ensure the emoji is preserved in all environments
const MONEY_EMOJI = '\u{1F4B0}';

export default {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription("Check your balance")
        // Note: Removed user option - users can only check their own balance
        ,

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        // Always check the balance of the user who ran the command (no option to check others)
        const targetUser = interaction.user;
        const guildId = interaction.guildId;

        logger.info(`[ECONOMY] Balance check - userId: ${targetUser.id}, guildId: ${guildId}`);
        logger.debug(`[ECONOMY] Balance check for ${targetUser.id}`, { userId: targetUser.id, guildId });

        if (targetUser.bot) {
            throw createError(
                "Bot user queried for balance",
                ErrorTypes.VALIDATION,
                "Bots don't have an economy balance."
            );
        }

        const userData = await getEconomyData(client, guildId, targetUser.id);

        logger.info(`[ECONOMY] Economy data retrieved - userData:`, userData);

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

        // Only show Total (wallet + bank) as requested
        const total = wallet + bank;

        const embed = createEmbed({
            title: `${MONEY_EMOJI} Your Balance`,
            description: `Here is your current financial status.`,
        })
            .addFields(
                {
                    name: "💰 Total",
                    value: `${MONEY_EMOJI} ${formatCurrency(total, { short: true, noSymbol: true })} gp`,
                    inline: true,
                }
            )
            .setFooter({
                text: `Your balance`,
                iconURL: interaction.user.displayAvatarURL(),
            });

        logger.info(`[ECONOMY] Balance retrieved`, { userId: targetUser.id, wallet, bank, total });

        // Clear any thumbnail/image and log the embed JSON for debugging
        try {
            const json = embed.toJSON ? embed.toJSON() : {};
            delete json.thumbnail;
            delete json.image;
            const cleaned = new EmbedBuilder(json);
            logger.debug('Sending embed (balance)', cleaned.toJSON());
            await InteractionHelper.safeEditReply(interaction, { embeds: [cleaned] });
        } catch (err) {
            logger.error('Failed to send cleaned embed for balance', err);
            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }
    }, { command: 'balance' })
};
