import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getEconomyData, setEconomyData, getMaxBankCapacity } from '../../utils/economy.js';

export default {
    data: new SlashCommandBuilder()
        .setName('withdraw')
        .setDescription('Withdraw money from your bank to your wallet')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Amount to withdraw')
                .setRequired(true)
                .setMinValue(1)
        ),

    async execute(interaction, config, client) {
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
};

