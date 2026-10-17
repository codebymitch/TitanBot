import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { successEmbed, buildUserErrorEmbed } from '../../../utils/embeds.js';
import { getEconomyData, setEconomyData, getMaxBankCapacity } from '../../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('deposit')
        .setDescription('Zahle Geld aus deiner Geldbörse auf deine Bank ein')
        .addStringOption(option =>
            option
                .setName('amount')
                .setDescription('Betrag zum Einzahlen (Zahl oder "all")')
                .setRequired(true)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
        
        const userId = interaction.user.id;
            const guildId = interaction.guildId!;
            const amountInput = interaction.options.getString("amount")!;

            const userData = await getEconomyData(client, guildId, userId);
            
            if (!userData) {
                throw createError(
                    "Failed to load economy data",
                    ErrorTypes.DATABASE,
                    "Deine Wirtschaftsdaten konnten nicht geladen werden. Bitte versuch es später erneut.",
                    { userId, guildId }
                );
            }
            
            const maxBank = getMaxBankCapacity(userData);
            let depositAmount;

            if (amountInput.toLowerCase() === "all") {
                depositAmount = userData.wallet;
            } else {
                depositAmount = parseInt(amountInput);

                if (isNaN(depositAmount) || depositAmount <= 0) {
                    throw createError(
                        "Invalid deposit amount",
                        ErrorTypes.VALIDATION,
                        `Bitte gib eine gültige Zahl oder „all“ ein. Deine Eingabe: \`${amountInput}\``,
                        { amountInput, userId }
                    );
                }
            }

            if (depositAmount === 0) {
                throw createError(
                    "Zero deposit amount",
                    ErrorTypes.VALIDATION,
                    "Du hast kein Geld zum Einzahlen.",
                    { userId, walletBalance: userData.wallet }
                );
            }

            if (depositAmount > userData.wallet) {
                depositAmount = userData.wallet;
                await interaction.followUp({
                    embeds: [
                        buildUserErrorEmbed(
                            'validation',
                            `Du wolltest mehr einzahlen, als du hast. Dein restliches Geld wird eingezahlt: **$${depositAmount.toLocaleString()}**`
                        )
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            }

            const availableSpace = maxBank - userData.bank;

            if (availableSpace <= 0) {
                throw createError(
                    "Bank is full",
                    ErrorTypes.VALIDATION,
                    `Deine Bank ist voll (max. Kapazität: $${maxBank.toLocaleString()}). Kauf ein **Bank-Upgrade**, um dein Limit zu erhöhen.`,
                    { maxBank, currentBank: userData.bank, userId }
                );
            }

            if (depositAmount > availableSpace) {
                const originalDepositAmount = depositAmount;
                depositAmount = availableSpace;

                if (amountInput.toLowerCase() !== "all") {
                    await interaction.followUp({
                        embeds: [
                            buildUserErrorEmbed(
                                'validation',
                                `Auf deinem Bankkonto war nur noch Platz für **$${depositAmount.toLocaleString()}** (max.: $${maxBank.toLocaleString()}). Der Rest bleibt in deiner Geldbörse.`
                            )
                        ],
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }

            if (depositAmount === 0) {
                throw createError(
                    "No space or cash for deposit",
                    ErrorTypes.VALIDATION,
                    "Der Betrag war entweder 0 oder hat nach Prüfung deiner Geldbörse die Kapazität deiner Bank überschritten.",
                    { depositAmount, availableSpace, walletBalance: userData.wallet }
                );
            }

            userData.wallet -= depositAmount;
            userData.bank += depositAmount;

            await setEconomyData(client, guildId, userId, userData);

            const embed = successEmbed(
                'Einzahlung erfolgreich',
                `Du hast **$${depositAmount.toLocaleString()}** auf deine Bank eingezahlt.`
            )
                .addFields(
                    {
                        name: "Geldbörse (neu)",
                        value: `$${userData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "Bank (neu)",
                        value: `$${userData.bank.toLocaleString()} / $${maxBank.toLocaleString()}`,
                        inline: true,
                    },
                );

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'deposit' })
} satisfies Command;
