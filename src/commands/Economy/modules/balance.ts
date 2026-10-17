import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { getEconomyData, getMaxBankCapacity } from '../../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../../utils/errorHandler.js';
import { logger } from '../../../utils/logger.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription("Zeige deinen Kontostand oder den eines anderen Nutzers")
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Nutzer, dessen Kontostand du sehen möchtest')
                .setRequired(false)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userOption = interaction.options.getUser("user");
        const targetUser = userOption || interaction.user;
        const guildId = interaction.guildId!;

        logger.info(`[ECONOMY] Balance check - userOption: ${userOption?.id || 'null'}, targetUser: ${targetUser.id}, guildId: ${guildId}, isPrefix: ${!!(interaction as typeof interaction & { _commandStartTime?: number })._commandStartTime}`);

        logger.debug(`[ECONOMY] Balance check for ${targetUser.id}`, { userId: targetUser.id, guildId });

        if (targetUser.bot) {
            throw createError(
                "Bot user queried for balance",
                ErrorTypes.VALIDATION,
                "Bots haben keinen Kontostand."
            );
        }

        const userData = await getEconomyData(client, guildId, targetUser.id);

        logger.info(`[ECONOMY] Economy data retrieved - userData:`, userData);

        if (!userData) {
            throw createError(
                "Failed to load economy data",
                ErrorTypes.DATABASE,
                "Die Wirtschaftsdaten konnten nicht geladen werden. Bitte versuch es später erneut.",
                { userId: targetUser.id, guildId }
            );
        }

        const maxBank = getMaxBankCapacity(userData);

        const wallet = typeof userData.wallet === 'number' ? userData.wallet : 0;
        const bank = typeof userData.bank === 'number' ? userData.bank : 0;

            const embed = createEmbed({
                title: `Kontostand von ${targetUser.username}`,
                description: `Hier ist der aktuelle Kontostand von ${targetUser.username}.`,
            })
                .addFields(
                    {
                        name: "💵 Geldbörse",
                        value: `$${wallet.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "🏦 Bank",
                        value: `$${bank.toLocaleString()} / $${maxBank.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "💰 Gesamt",
                        value: `$${(wallet + bank).toLocaleString()}`,
                        inline: true,
                    }
                )
                .setFooter({
                    text: `Angefragt von ${interaction.user.tag}`,
                    iconURL: interaction.user.displayAvatarURL(),
                });

            logger.info(`[ECONOMY] Balance retrieved`, { userId: targetUser.id, wallet, bank });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'balance' })
} satisfies Command;
