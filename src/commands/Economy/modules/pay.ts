import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { getEconomyData, addMoney, removeMoney, setEconomyData } from '../../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../../utils/errorHandler.js';
import { logger } from '../../../utils/logger.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import EconomyService from '../../../services/economyService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('pay')
        .setDescription('Gib einem anderen Nutzer etwas von deinem Geld')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Nutzer, den du bezahlen möchtest')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Betrag, den du zahlen möchtest')
                .setRequired(true)
                .setMinValue(1)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const senderId = interaction.user.id;
            const receiver = interaction.options.getUser("user")!;
            const amount = interaction.options.getInteger("amount")!;
            const guildId = interaction.guildId!;

            logger.debug(`[ECONOMY] Pay command initiated`, { 
                senderId, 
                receiverId: receiver.id,
                amount,
                guildId
            });

            if (receiver.bot) {
                throw createError(
                    "Cannot pay bot",
                    ErrorTypes.VALIDATION,
                    "Du kannst keinen Bot bezahlen.",
                    { receiverId: receiver.id, isBot: true }
                );
            }
            
            if (receiver.id === senderId) {
                throw createError(
                    "Cannot pay self",
                    ErrorTypes.VALIDATION,
                    "Du kannst dich nicht selbst bezahlen.",
                    { senderId, receiverId: receiver.id }
                );
            }
            
            if (amount <= 0) {
                throw createError(
                    "Invalid payment amount",
                    ErrorTypes.VALIDATION,
                    "Der Betrag muss größer als null sein.",
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
                    "Deine Wirtschaftsdaten konnten nicht geladen werden. Bitte versuch es später erneut.",
                    { userId: senderId, guildId }
                );
            }
            
            if (!receiverData) {
                throw createError(
                    "Failed to load receiver economy data",
                    ErrorTypes.DATABASE,
                    "Die Wirtschaftsdaten des Empfängers konnten nicht geladen werden. Bitte versuch es später erneut.",
                    { userId: receiver.id, guildId }
                );
            }

            const result = await EconomyService.transferMoney(
                client, 
                guildId, 
                senderId, 
                receiver.id, 
                amount
            );

            const updatedSenderData = await getEconomyData(client, guildId, senderId);
            const updatedReceiverData = await getEconomyData(client, guildId, receiver.id);

            const embed = successEmbed(
                'Zahlung erfolgreich',
                `Du hast **${receiver.username}** erfolgreich **$${amount.toLocaleString()}** gezahlt!`
            )
                .addFields(
                    {
                        name: "Betrag",
                        value: `$${amount.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "Dein neuer Kontostand",
                        value: `$${updatedSenderData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                )
                .setFooter({
                    text: `Gezahlt an ${receiver.tag}`,
                    iconURL: receiver.displayAvatarURL(),
                });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

            logger.info(`[ECONOMY] Payment sent successfully`, {
                senderId,
                receiverId: receiver.id,
                amount,
                senderBalance: updatedSenderData.wallet,
                receiverBalance: updatedReceiverData.wallet
            });

            try {
                const receiverEmbed = createEmbed({ 
                    title: "Zahlung erhalten!", 
                    description: `${interaction.user.username} hat dir **$${amount.toLocaleString()}** gezahlt.` 
                }).addFields({
                    name: "Deine Geldbörse (neu)",
                    value: `$${updatedReceiverData.wallet.toLocaleString()}`,
                    inline: true,
                });
                await receiver.send({ embeds: [receiverEmbed] });
            } catch (e) {
                    logger.warn(`Could not DM user ${receiver.id}: ${e instanceof Error ? e.message : String(e)}`);
            }
    }, { command: 'pay' })
} satisfies Command;
