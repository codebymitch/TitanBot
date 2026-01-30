import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { transferMoney, getEconomyData, getMaxBankCapacity, setEconomyData } from '../../services/economy.js';
import { botConfig } from '../../config/bot.js';

// Migrated from: commands/Economy/withdraw.js
export default {
    // Slash command data
    data: new SlashCommandBuilder()
        .setName("withdraw")
        .setDescription("Withdraw money from your bank account to your cash.")
        .addIntegerOption((option) =>
            option
                .setName("amount")
                .setDescription("The amount of money to withdraw.")
                .setRequired(true),
        )
        .setDMPermission(false),
    
    // Prefix command data
    name: "withdraw",
    aliases: ["with", "wd"],
    description: "Withdraw money from your bank account to your cash.",
    category: "Economy",
    usage: `${botConfig.commands.prefix}withdraw <amount|all>`,
    cooldown: 5,

    // Slash command execution
    async execute(interaction, config, client) {
        await interaction.deferReply();

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const amountInput = interaction.options.getInteger("amount");

        try {
            const userData = await getEconomyData(client, guildId, userId);
            let withdrawAmount = amountInput;

            if (withdrawAmount <= 0) {
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Invalid Amount",
                            "You must withdraw a positive amount.",
                        ),
                    ],
                });
            }

            if (withdrawAmount > userData.bank) {
                withdrawAmount = userData.bank;
            }

            if (withdrawAmount === 0) {
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Withdrawal Failed",
                            "Your bank account is empty.",
                        ),
                    ],
                });
            }

            // Perform transaction
            userData.wallet += withdrawAmount;
            userData.bank -= withdrawAmount;

            await setEconomyData(client, guildId, userId, userData);

            const embed = successEmbed(
                "💰 Withdrawal Successful",
                `You successfully withdrew **$${withdrawAmount.toLocaleString()}** from your bank.`,
            ).addFields(
                {
                    name: "💵 New Cash Balance",
                    value: `$${userData.wallet.toLocaleString()}`,
                    inline: true,
                },
                {
                    name: "🏦 New Bank Balance",
                    value: `$${userData.bank.toLocaleString()}`,
                    inline: true,
                },
            );

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error("Withdraw command error:", error);
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "System Error",
                        "Could not process your withdrawal.",
                    ),
                ],
            });
        }
    },

    // Prefix command execution
    async executeMessage(message, args, client) {
        const userId = message.author.id;
        const guildId = message.guild.id;
        
        // Get amount from command arguments
        const amountInput = args[0];

        if (!amountInput) {
            return message.reply({
                embeds: [
                    errorEmbed(
                        "Missing Amount",
                        "Please specify an amount to withdraw. Usage: `!withdraw <amount|all>`",
                    ),
                ],
            });
        }

        try {
            const userData = await getEconomyData(client, guildId, userId);

            // Parse amount input
            let withdrawAmount;
            if (amountInput.toLowerCase() === "all") {
                withdrawAmount = userData.bank;
            } else {
                const parsedAmount = parseInt(amountInput);
                if (isNaN(parsedAmount) || parsedAmount <= 0) {
                    return message.reply({
                        embeds: [
                            errorEmbed(
                                "Invalid Amount",
                                "Please provide a valid positive number or 'all'.",
                            ),
                        ],
                    });
                }
                withdrawAmount = parsedAmount;
            }

            // Validation checks
            if (userData.bank === 0) {
                return message.reply({
                    embeds: [
                        errorEmbed(
                            "Withdrawal Failed",
                            "Your bank account is empty.",
                        ),
                    ],
                });
            }

            if (withdrawAmount > userData.bank) {
                return message.reply({
                    embeds: [
                        errorEmbed(
                            "Insufficient Funds",
                            `You only have **$${userData.bank.toLocaleString()}** in your bank.`,
                        ),
                    ],
                });
            }

            // Perform transaction
            userData.wallet += withdrawAmount;
            userData.bank -= withdrawAmount;

            await setEconomyData(client, guildId, userId, userData);

            const embed = successEmbed(
                "💰 Withdrawal Successful",
                `You successfully withdrew **$${withdrawAmount.toLocaleString()}** from your bank.`,
            ).addFields(
                {
                    name: "💵 New Cash Balance",
                    value: `$${userData.wallet.toLocaleString()}`,
                    inline: true,
                },
                {
                    name: "🏦 New Bank Balance",
                    value: `$${userData.bank.toLocaleString()}`,
                    inline: true,
                },
            );

            await message.reply({ embeds: [embed] });
        } catch (error) {
            console.error("Withdraw command error:", error);
            await message.reply({
                embeds: [
                    errorEmbed(
                        "System Error",
                        "Could not process your withdrawal.",
                    ),
                ],
            });
        }
    }
};
