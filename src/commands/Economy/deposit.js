import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Economy/deposit.js
export default {
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
    category: "Economy",

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
                depositAmount = userData.cash;
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
            if (depositAmount > userData.cash) {
                // Adjust depositAmount to user's cash if a high number was given
                depositAmount = userData.cash;
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

            userData.cash -= depositAmount;
            userData.bank += depositAmount;

            await setEconomyData(client, guildId, userId, userData);

            const embed = successEmbed(
                "💸 Deposit Successful",
                `You successfully deposited **$${depositAmount.toLocaleString()}** into your bank.`,
            ).addFields(
                {
                    name: "💵 New Cash Balance",
                    value: `$${userData.cash.toLocaleString()}`,
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
};

