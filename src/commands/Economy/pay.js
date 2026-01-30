import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getEconomyData, addMoney, removeMoney, setEconomyData } from '../../services/economy.js';
import { botConfig } from '../../config/bot.js';

// Migrated from: commands/Economy/pay.js
export default {
    // Slash command data
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
    
    // Prefix command data
    name: "pay",
    aliases: ["send", "transfer", "give"],
    description: "Pay another user cash from your balance.",
    category: "Economy",
    usage: `${botConfig.commands.prefix}pay <user> <amount>`,
    cooldown: 5,

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

    // Prefix command execution
    async executeMessage(message, args, client) {
        const senderId = message.author.id;
        const guildId = message.guild.id;

        // Parse arguments
        if (args.length < 2) {
            return message.reply({
                embeds: [
                    errorEmbed(
                        "Invalid Usage",
                        "Usage: `!pay <user> <amount>`",
                    ),
                ],
            });
        }

        const receiver = message.mentions.users.first();
        const amount = parseInt(args[1]);

        if (!receiver) {
            return message.reply({
                embeds: [
                    errorEmbed(
                        "Invalid User",
                        "Please mention a valid user to pay.",
                    ),
                ],
            });
        }

        if (receiver.bot) {
            return message.reply({
                embeds: [
                    errorEmbed(
                        "Cannot Pay Bots",
                        "You cannot pay bots.",
                    ),
                ],
            });
        }

        if (receiver.id === senderId) {
            return message.reply({
                embeds: [
                    errorEmbed(
                        "Cannot Pay Yourself",
                        "You cannot pay yourself.",
                    ),
                ],
            });
        }

        if (isNaN(amount) || amount <= 0) {
            return message.reply({
                embeds: [
                    errorEmbed(
                        "Invalid Amount",
                        "Please provide a valid positive amount.",
                    ),
                ],
            });
        }

        try {
            const senderData = await getEconomyData(client, guildId, senderId);

            if (senderData.wallet < amount) {
                return message.reply({
                    embeds: [
                        errorEmbed(
                            "Insufficient Funds",
                            `You only have **$${senderData.wallet.toLocaleString()}** in cash.`,
                        ),
                    ],
                });
            }

            // Remove money from sender
            const removeResult = await removeMoney(client, guildId, senderId, amount, 'wallet');
            if (!removeResult.success) {
                return message.reply({
                    embeds: [
                        errorEmbed(
                            "Payment Failed",
                            removeResult.error || "Failed to remove money from your wallet.",
                        ),
                    ],
                });
            }

            // Add money to receiver
            const addResult = await addMoney(client, guildId, receiver.id, amount, 'wallet');
            if (!addResult.success) {
                // If adding money failed, refund the sender
                await addMoney(client, guildId, senderId, amount, 'wallet');
                return message.reply({
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

            await message.reply({ embeds: [embed] });

            // Send notification to receiver
            try {
                const receiverEmbed = createEmbed({ 
                    title: "💰 Incoming Payment!", 
                    description: `${message.author.username} paid you **$${amount.toLocaleString()}**.` 
                }).addFields({
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
            await message.reply({
                embeds: [
                    errorEmbed(
                        "System Error",
                        "Could not process your payment.",
                    ),
                ],
            });
        }
    }
};
