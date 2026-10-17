import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags, type GuildMember, type GuildBasedChannel } from 'discord.js';
import { errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { NexoBotError, ErrorTypes } from '../../../utils/errorHandler.js';
import { saveGiveaway } from '../../../utils/giveaways.js';
import type { Giveaway } from '../../../utils/giveaways.js';
import { 
    parseDuration, 
    validatePrize, 
    validateWinnerCount,
    createGiveawayEmbed, 
    createGiveawayButtons 
} from '../../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../../services/loggingService.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

import { botConfig } from '../../../config/bot.js';

const GIVEAWAY_MIN_WINNERS = botConfig.giveaways?.minimumWinners ?? 1;
const GIVEAWAY_MAX_WINNERS = botConfig.giveaways?.maximumWinners ?? 10;

export default {
    data: new SlashCommandBuilder()
        .setName("gcreate")
        .setDescription("Startet ein neues Giveaway in einem bestimmten Kanal.")
        .addStringOption((option) =>
            option
                .setName("duration")
                .setDescription(
                    "Wie lange das Giveaway laufen soll (z. B. 1h, 30m, 5d).",
                )
                .setRequired(true),
        )
        .addIntegerOption((option) =>
            option
                .setName("winners")
                .setDescription("Die Anzahl der Gewinner.")
                .setMinValue(GIVEAWAY_MIN_WINNERS)
                .setMaxValue(GIVEAWAY_MAX_WINNERS)
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName("prize")
                .setDescription("Der Preis, der verlost wird.")
                .setRequired(true),
        )
        .addChannelOption((option) =>
            option
                .setName("channel")
                .setDescription("Der Kanal für das Giveaway (Standard: aktueller Kanal).")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        // Defer up front: sending the giveaway message + DB write can exceed the 3s window
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

        if (!interaction.inGuild()) {
            throw new NexoBotError(
                'Giveaway command used outside guild',
                ErrorTypes.VALIDATION,
                'Dieser Command kann nur auf einem Server genutzt werden.',
                { userId: interaction.user.id }
            );
        }

        if (!(interaction.member as GuildMember).permissions.has(PermissionFlagsBits.ManageGuild)) {
            throw new NexoBotError(
                'User lacks ManageGuild permission',
                ErrorTypes.PERMISSION,
                "Du brauchst die Berechtigung „Server verwalten“, um ein Giveaway zu starten.",
                { userId: interaction.user.id, guildId: interaction.guildId }
            );
        }

        logger.info(`Giveaway creation started by ${interaction.user.tag} in guild ${interaction.guildId}`);

        const durationString = interaction.options.getString("duration");
        const winnerCount = interaction.options.getInteger("winners")!;
        const prize = interaction.options.getString("prize");
        const targetChannel = (interaction.options.getChannel("channel") || interaction.channel) as GuildBasedChannel;

        const durationMs = parseDuration(durationString);
        validateWinnerCount(winnerCount);
        const prizeName = validatePrize(prize);

        if (!targetChannel.isTextBased()) {
            throw new NexoBotError(
                'Target channel is not text-based',
                ErrorTypes.VALIDATION,
                'Der Kanal muss ein Textkanal sein.',
                { channelId: targetChannel.id, channelType: targetChannel.type }
            );
        }

        const endTime = Date.now() + durationMs;

        const initialGiveawayData: Giveaway = {
            messageId: "placeholder",
            channelId: targetChannel.id,
            guildId: interaction.guildId,
            prize: prizeName,
            hostId: interaction.user.id,
            endTime: endTime,
            endsAt: endTime,
            winnerCount: winnerCount,
            participants: [],
            isEnded: false,
            ended: false,
            createdAt: new Date().toISOString()
        };

        const embed = createGiveawayEmbed(initialGiveawayData, "active");
        const row = createGiveawayButtons(false);

        const giveawayMessage = await targetChannel.send({
            content: "🎉 **NEUES GIVEAWAY** 🎉",
            embeds: [embed],
            components: [row],
        });

        initialGiveawayData.messageId = giveawayMessage.id;
        const saved = await saveGiveaway(
            interaction.client,
            interaction.guildId,
            initialGiveawayData,
        );

        if (!saved) {
            logger.warn(`Failed to save giveaway to database: ${giveawayMessage.id}`);
        }

        try {
            await logEvent({
                client: interaction.client,
                guildId: interaction.guildId,
                eventType: EVENT_TYPES.GIVEAWAY_CREATE,
                data: {
                    description: `Giveaway erstellt: ${prizeName}`,
                    channelId: targetChannel.id,
                    userId: interaction.user.id,
                    fields: [
                        {
                            name: 'Preis',
                            value: prizeName,
                            inline: true
                        },
                        {
                            name: 'Gewinner',
                            value: winnerCount.toString(),
                            inline: true
                        },
                        {
                            name: 'Dauer',
                            value: durationString,
                            inline: true
                        },
                        {
                            name: 'Kanal',
                            value: targetChannel.toString(),
                            inline: true
                        }
                    ]
                }
            });
        } catch (logError) {
            logger.debug('Error logging giveaway creation event:', logError);
        }

        logger.info(`Giveaway created successfully: ${giveawayMessage.id} in ${targetChannel.name}`);

        await InteractionHelper.safeReply(interaction, {
            embeds: [
                successEmbed(
                    `Giveaway gestartet! 🎉`,
                    `Ein neues Giveaway für **${prizeName}** läuft jetzt in ${targetChannel} und endet in **${durationString}**.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
} satisfies Command;
