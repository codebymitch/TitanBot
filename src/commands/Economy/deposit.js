import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { transferMoney, getEconomyData, getMaxBankCapacity, setEconomyData } from '../../services/economy.js';
import { botConfig } from '../../config/bot.js';

// Migrated from: commands/Economy/deposit.js
export default {
    // Slash command data
    data: new SlashCommandBuilder()
        .setName("deposit")
        .setDescription("Deposit cash into your bank account.")
        .addStringOption(
            (
                option, // CHANGED TO STRING OPTION
            ) =>
                option
                    .setName("amount")
                    .setDescription("The amount of money to deposit, or 'all'.")
                    .setRequired(true),
        )
        .setDMPermission(false),
    
    // Prefix command data
    name: "deposit",
    aliases: ["dep", "bank"],
    description: "Deposit cash into your bank account.",
    category: "Economy",
    usage: `${botConfig.commands.prefix}deposit <amount|all>`,
    cooldown: 5,

    // Slash command execution
    async execute(interaction, config, client) {
        await interaction.deferReply();

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        // CHANGED to getString since the option type is now string
        const amountInput = interaction.options.getString("amount");

        try {
            const userData = await getEconomyData(client, guildId, userId);
            const maxBank = getMaxBankCapacity(userData);
            let depositAmount;

            // --- 1. HANDLE 'ALL' INPUT AND PARSING ---
            if (amountInput.toLowerCase() === "all") {
                depositAmount = userData.wallet;
            } else {
                // Parse the string input to a number
                depositAmount = parseInt(amountInput);

                // Check if parsing failed or is zero/negative
                if (isNaN(depositAmount) || depositAmount <= 0) {
                    return interaction.editReply({
                        embeds: [
                            errorEmbed(
                                "Invalid Amount",
                                `Please enter a valid number or 'all'. You entered: \`${amountInput}\``,
                            ),
                        ],
                    });
                }
            }
            // ----------------------------------------

            if (depositAmount === 0) {
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Deposit Failed",
                            "You have no cash to deposit.",
                        ),
                    ],
                });
            }

            // --- 2. Cash Availability Check (Only needed if a specific number > cash was entered) ---
            if (depositAmount > userData.wallet) {
                // Adjust depositAmount to user's cash if a high number was given
                depositAmount = userData.wallet;
                // Optional: Notify user that the amount was capped to their available cash
                await interaction.followUp({
                    embeds: [
                        errorEmbed(
                            "Deposit Capped",
                            `You tried to deposit more than you have. Depositing your remaining cash: **$${depositAmount.toLocaleString()}**`,
                        ),
                    ],
                    ephemeral: true,
                });
            }

            // --- 3. Bank Capacity Check ---
            const availableSpace = maxBank - userData.bank;

            if (availableSpace <= 0) {
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Bank Full",
                            `Your bank is currently full (Max Capacity: $${maxBank.toLocaleString()}). Purchase a **Bank Upgrade** to increase your limit.`,
                        ),
                    ],
                });
            }

            // Cap the deposit amount to the available space
            if (depositAmount > availableSpace) {
                const originalDepositAmount = depositAmount;
                depositAmount = availableSpace;

                // Only send a followUp if the user didn't request 'all' and we capped their input
                if (amountInput.toLowerCase() !== "all") {
                    await interaction.followUp({
                        embeds: [
                            errorEmbed(
                                "Deposit Capped",
                                `You only had space for **$${depositAmount.toLocaleString()}** in your bank account (Max: $${maxBank.toLocaleString()}). The rest remains in your cash.`,
                            ),
                        ],
                        ephemeral: true,
                    });
                }
            }

            // --- 4. Perform Transaction ---
            if (depositAmount === 0) {
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "No Space/Cash",
                            "The amount you tried to deposit was either 0 or exceeded your bank capacity after checking your cash balance.",
                        ),
                    ],
                });
            }

            userData.wallet -= depositAmount;
            userData.bank += depositAmount;

            await setEconomyData(client, guildId, userId, userData);

            const embed = successEmbed(
                "💸 Deposit Successful",
                `You successfully deposited **$${depositAmount.toLocaleString()}** into your bank.`,
            ).addFields(
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
        } catch (error) {
            console.error("Deposit command error:", error);
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "System Error",
                        "Could not process your deposit.",
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
                        "Please specify an amount to deposit. Usage: `!deposit <amount|all>`",
                    ),
                ],
            });
        }

        try {
            const userData = await getEconomyData(client, guildId, userId);
            const maxBank = getMaxBankCapacity(userData);

            // Parse amount input
            let depositAmount;
            if (amountInput.toLowerCase() === "all") {
                depositAmount = userData.wallet;
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
                depositAmount = parsedAmount;
            }

            // Validation checks
            if (depositAmount > userData.wallet) {
                return message.reply({
                    embeds: [
                        errorEmbed(
                            "Insufficient Cash",
                            `You only have **$${userData.wallet.toLocaleString()}** in cash.`,
                        ),
                    ],
                });
            }

            if (userData.bank + depositAmount > maxBank) {
                return message.reply({
                    embeds: [
                        errorEmbed(
                            "Bank Capacity Exceeded",
                            `Your bank can only hold **$${maxBank.toLocaleString()}**. You currently have **$${userData.bank.toLocaleString()}**.`,
                        ),
                    ],
                });
            }

            // Process deposit
            userData.wallet -= depositAmount;
            userData.bank += depositAmount;

            await setEconomyData(client, guildId, userId, userData);

            const embed = successEmbed(
                "💸 Deposit Successful",
                `You successfully deposited **$${depositAmount.toLocaleString()}** into your bank.`,
            ).addFields(
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

            await message.reply({ embeds: [embed] });
        } catch (error) {
            console.error("Deposit command error:", error);
            await message.reply({
                embeds: [
                    errorEmbed(
                        "System Error",
                        "Could not process your deposit.",
                    ),
                ],
            });
        }
    }
};

