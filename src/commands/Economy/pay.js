import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getEconomyData, addMoney, removeMoney, setEconomyData } from '../../utils/economy.js';

export default {
    data: new SlashCommandBuilder()
        .setName('pay')
        .setDescription('Pay another user some of your cash')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to pay')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Amount to pay')
                .setRequired(true)
                .setMinValue(1)
        ),

    async execute(interaction, config, client) {
        const senderId = interaction.user.id;
        const receiver = interaction.options.getUser("user");
        const amount = interaction.options.getInteger("amount");
        const guildId = interaction.guildId;

        if (receiver.bot) {
            return interaction.editReply({
                embeds: [errorEmbed("Payment Failed", "You cannot pay a bot.")],
            });
        }
        if (receiver.id === senderId) {
            return interaction.editReply({
                embeds: [
                    errorEmbed("Payment Failed", "You cannot pay yourself."),
                ],
            });
        }
        if (amount <= 0) {
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Payment Failed",
                        "Amount must be greater than zero.",
                    ),
                ],
            });
        }

        try {
            const senderData = await getEconomyData(client, guildId, senderId);
            const receiverData = await getEconomyData(
                client,
                guildId,
                receiver.id,
            );

            if (senderData.wallet < amount) {
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Insufficient Funds",
                            `You only have $${senderData.wallet.toLocaleString()} in cash.`,
                        ),
                    ],
                });
            }

            // Perform transaction using economy service functions
            const removeResult = await removeMoney(client, guildId, senderId, amount, 'wallet');
            if (!removeResult.success) {
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Payment Failed",
                            removeResult.error || "Failed to remove money from your wallet.",
                        ),
                    ],
                });
            }

            const addResult = await addMoney(client, guildId, receiver.id, amount, 'wallet');
            if (!addResult.success) {
                // If adding money failed, refund the sender
                await addMoney(client, guildId, senderId, amount, 'wallet');
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Payment Failed",
                            addResult.error || "Failed to add money to receiver's wallet.",
                        ),
                    ],
                });
            }

            // Get updated data for display
            const updatedSenderData = await getEconomyData(client, guildId, senderId);
            const updatedReceiverData = await getEconomyData(client, guildId, receiver.id);

            const embed = successEmbed(
                "🤝 Payment Complete",
                `You successfully paid **$${amount.toLocaleString()}** to **${receiver.username}**.`,
            ).addFields({
                name: "Your New Cash",
                value: `$${updatedSenderData.wallet.toLocaleString()}`,
                inline: true,
            });

            await interaction.editReply({ embeds: [embed] });

            // Send notification to receiver
            try {
                const receiverEmbed = createEmbed({ title: "💰 Incoming Payment!", description: `${interaction.user.username} paid you **$${amount.toLocaleString()}**.` }).addFields({
                    name: "Your New Cash",
                    value: `$${updatedReceiverData.wallet.toLocaleString()}`,
                    inline: true,
                });
                await receiver.send({ embeds: [receiverEmbed] });
            } catch (e) {
                console.log(`Could not DM user ${receiver.id}:`, e.message);
            }
        } catch (error) {
            console.error("Pay command error:", error);
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "System Error",
                        "Could not process your payment.",
                    ),
                ],
            });
        }
    },
};

