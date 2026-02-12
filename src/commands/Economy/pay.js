import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getEconomyData, addMoney, removeMoney, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { MessageTemplates } from '../../utils/messageTemplates.js';

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
        return withErrorHandling(async () => {
            await interaction.deferReply();
            
            const senderId = interaction.user.id;
            const receiver = interaction.options.getUser("user");
            const amount = interaction.options.getInteger("amount");
            const guildId = interaction.guildId;

            if (receiver.bot) {
                throw createError(
                    "Cannot pay bot",
                    ErrorTypes.VALIDATION,
                    "You cannot pay a bot.",
                    { receiverId: receiver.id, isBot: true }
                );
            }
            
            if (receiver.id === senderId) {
                throw createError(
                    "Cannot pay self",
                    ErrorTypes.VALIDATION,
                    "You cannot pay yourself.",
                    { senderId, receiverId: receiver.id }
                );
            }
            
            if (amount <= 0) {
                throw createError(
                    "Invalid payment amount",
                    ErrorTypes.VALIDATION,
                    "Amount must be greater than zero.",
                    { amount, senderId }
                );
            }

            const [senderData, receiverData] = await Promise.all([
                getEconomyData(client, guildId, senderId),
                getEconomyData(client, guildId, receiver.id)
            ]);

            if (!senderData) {
                throw createError(
                    "Failed to load sender economy data",
                    ErrorTypes.DATABASE,
                    "Failed to load your economy data. Please try again later.",
                    { userId: senderId, guildId }
                );
            }
            
            if (!receiverData) {
                throw createError(
                    "Failed to load receiver economy data",
                    ErrorTypes.DATABASE,
                    "Failed to load the receiver's economy data. Please try again later.",
                    { userId: receiver.id, guildId }
                );
            }

            if (senderData.wallet < amount) {
                throw createError(
                    "Insufficient funds for payment",
                    ErrorTypes.VALIDATION,
                    `You only have $${senderData.wallet.toLocaleString()} in cash.`,
                    { amount, walletBalance: senderData.wallet, senderId }
                );
            }

            senderData.wallet -= amount;
            receiverData.wallet += amount;

            await Promise.all([
                setEconomyData(client, guildId, senderId, senderData),
                setEconomyData(client, guildId, receiver.id, receiverData)
            ]);

            const embed = MessageTemplates.SUCCESS.DATA_UPDATED(
                "payment",
                `You successfully paid **${receiver.username}** the amount of **$${amount.toLocaleString()}**!`
            )
                .addFields(
                    {
                        name: "ðŸ’³ Payment Amount",
                        value: `$${amount.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "ðŸ’µ Your New Balance",
                        value: `$${senderData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                )
                .setFooter({
                    text: `Paid to ${receiver.tag}`,
                    iconURL: receiver.displayAvatarURL(),
                });

            await interaction.editReply({ embeds: [embed] });

            try {
                const receiverEmbed = createEmbed({ 
                    title: "ðŸ’° Incoming Payment!", 
                    description: `${interaction.user.username} paid you **$${amount.toLocaleString()}**.` 
                }).addFields({
                    name: "Your New Cash",
                    value: `$${receiverData.wallet.toLocaleString()}`,
                    inline: true,
                });
                await receiver.send({ embeds: [receiverEmbed] });
            } catch (e) {
                console.log(`Could not DM user ${receiver.id}:`, e.message);
            }
        }, { command: 'pay' });
    },
};


