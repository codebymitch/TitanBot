import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Economy/pay.js
export default {
    data: new SlashCommandBuilder()
        .setName("pay")
        .setDescription("Pay another user cash from your balance.")
        .addUserOption((option) =>
            option
                .setName("user")
                .setDescription("The user you want to pay.")
                .setRequired(true),
        )
        .addIntegerOption((option) =>
            option
                .setName("amount")
                .setDescription("The amount of cash to pay.")
                .setRequired(true),
        )
        .setDMPermission(false),
    category: "Economy",

    async execute(interaction, config, client) {
        await interaction.deferReply();

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

            if (senderData.cash < amount) {
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Insufficient Funds",
                            `You only have $${senderData.cash.toLocaleString()} in cash.`,
                        ),
                    ],
                });
            }

            // Perform transaction
            senderData.cash -= amount;
            receiverData.cash += amount;

            // Save both users' data
            await setEconomyData(client, guildId, senderId, senderData);
            await setEconomyData(client, guildId, receiver.id, receiverData);

            const embed = successEmbed(
                "🤝 Payment Complete",
                `You successfully paid **$${amount.toLocaleString()}** to **${receiver.username}**.`,
            ).addFields({
                name: "Your New Cash",
                value: `$${senderData.cash.toLocaleString()}`,
                inline: true,
            });

            await interaction.editReply({ embeds: [embed] });

            // Send notification to receiver
            try {
                const receiverEmbed = createEmbed(
                    "💰 Incoming Payment!",
                    `${interaction.user.username} paid you **$${amount.toLocaleString()}**.`,
                ).addFields({
                    name: "Your New Cash",
                    value: `$${receiverData.cash.toLocaleString()}`,
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
                        "Could not process the payment.",
                    ),
                ],
            });
        }
    },
};
