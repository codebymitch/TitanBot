import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Economy/withdraw.js
export default {
    data: new SlashCommandBuilder()
        .setName("withdraw")
        .setDescription("Withdraw money from your bank account to your cash.")
        .addIntegerOption((option) =>
            option
                .setName("amount")
                .setDescription("The amount of money to withdraw, or 'all'.")
                .setRequired(true),
        )
        .setDMPermission(false),
    category: "Economy",

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
            userData.cash += withdrawAmount;
            userData.bank -= withdrawAmount;

            await setEconomyData(client, guildId, userId, userData);

            const embed = successEmbed(
                "💰 Withdrawal Successful",
                `You successfully withdrew **$${withdrawAmount.toLocaleString()}** from your bank.`,
            ).addFields(
                {
                    name: "💵 New Cash Balance",
                    value: `$${userData.cash.toLocaleString()}`,
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
};
