import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { getEconomyData, setEconomyData, getMaxBankCapacity } from '../../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../../utils/errorHandler.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName('withdraw')
        .setDescription('Hebe Geld von deiner Bank in deine Geldbörse ab')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Betrag, den du abheben möchtest')
                .setRequired(true)
                .setMinValue(1)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        await InteractionHelper.safeDefer(interaction);
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId!;
            const amountInput = interaction.options.getInteger("amount")!;

            const userData = await getEconomyData(client, guildId, userId);
            
            if (!userData) {
                throw createError(
                    "Failed to load economy data",
                    ErrorTypes.DATABASE,
                    "Deine Wirtschaftsdaten konnten nicht geladen werden. Bitte versuch es später erneut.",
                    { userId, guildId }
                );
            }

            let withdrawAmount = amountInput;

            if (withdrawAmount <= 0) {
                throw createError(
                    "Invalid withdrawal amount",
                    ErrorTypes.VALIDATION,
                    "Du musst einen positiven Betrag abheben.",
                    { amount: withdrawAmount, userId }
                );
            }

            if (withdrawAmount > userData.bank) {
                withdrawAmount = userData.bank;
            }

            if (withdrawAmount === 0) {
                throw createError(
                    "Empty bank account",
                    ErrorTypes.VALIDATION,
                    "Dein Bankkonto ist leer.",
                    { userId, bankBalance: userData.bank }
                );
            }

            userData.wallet += withdrawAmount;
            userData.bank -= withdrawAmount;

            await setEconomyData(client, guildId, userId, userData);

            const embed = successEmbed(
                'Abhebung erfolgreich',
                `Du hast **$${withdrawAmount.toLocaleString()}** von deiner Bank abgehoben.`
            )
                .addFields(
                    {
                        name: "Geldbörse (neu)",
                        value: `$${userData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "Bank (neu)",
                        value: `$${userData.bank.toLocaleString()}`,
                        inline: true,
                    },
                );

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'withdraw' })
} satisfies Command;
