import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData, getMaxBankCapacity } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { MessageTemplates } from '../../utils/messageTemplates.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('deposit')
        .setDescription('Deposit money from your wallet into your bank')
        .addStringOption(option =>
            option
                .setName('amount')
                .setDescription('Amount to deposit (number or "all")')
                .setRequired(true)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
        
        const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const amountInput = interaction.options.getString("amount");

            const userData = await getEconomyData(client, guildId, userId);
            
            if (!userData) {
                throw createError(
                    "Failed to load economy data",
                    ErrorTypes.DATABASE,
                    "Failed to load your economy data. Please try again later.",
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
                        `Please enter a valid number or 'all'. You entered: \`${amountInput}\``,
                        { amountInput, userId }
                    );
                }
            }

            if (depositAmount === 0) {
                throw createError(
                    "Zero deposit amount",
                    ErrorTypes.VALIDATION,
                    "You have no cash to deposit.",
                    { userId, walletBalance: userData.wallet }
                );
            }

            if (depositAmount > userData.wallet) {
                depositAmount = userData.wallet;
                await interaction.followUp({
                    embeds: [
                        MessageTemplates.ERRORS.INVALID_INPUT(
                            "deposit amount",
                            `You tried to deposit more than you have. Depositing your remaining cash: **$${depositAmount.toLocaleString()}**`
                        )
                    ],
                    flags: ["Ephemeral"],
                });
            }

            const availableSpace = maxBank - userData.bank;

            if (availableSpace <= 0) {
                throw createError(
                    "Bank is full",
                    ErrorTypes.VALIDATION,
                    `Your bank is currently full (Max Capacity: $${maxBank.toLocaleString()}). Purchase a **Bank Upgrade** to increase your limit.`,
                    { maxBank, currentBank: userData.bank, userId }
                );
            }

            if (depositAmount > availableSpace) {
                const originalDepositAmount = depositAmount;
                depositAmount = availableSpace;

                if (amountInput.toLowerCase() !== "all") {
                    await interaction.followUp({
                        embeds: [
                            MessageTemplates.ERRORS.INVALID_INPUT(
                                "deposit amount",
                                `You only had space for **$${depositAmount.toLocaleString()}** in your bank account (Max: $${maxBank.toLocaleString()}). The rest remains in your cash.`
                            )
                        ],
                        flags: ["Ephemeral"],
                    });
                }
            }

            if (depositAmount === 0) {
                throw createError(
                    "No space or cash for deposit",
                    ErrorTypes.VALIDATION,
                    "The amount you tried to deposit was either 0 or exceeded your bank capacity after checking your cash balance.",
                    { depositAmount, availableSpace, walletBalance: userData.wallet }
                );
            }

            userData.wallet -= depositAmount;
            userData.bank += depositAmount;

            await setEconomyData(client, guildId, userId, userData);

            const embed = MessageTemplates.SUCCESS.DATA_UPDATED(
                "deposit",
                `You successfully deposited **$${depositAmount.toLocaleString()}** into your bank.`
            )
                .addFields(
                    {
                        name: "💵 New Cash Balance",
                        value: `$${userData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "🏦 New Bank Balance",
                        value: `$${userData.bank.toLocaleString()} / $${maxBank.toLocaleString()}`,
                        inline: true,
                    },
                );

            await interaction.editReply({ embeds: [embed] });
    }, { command: 'deposit' })
};





