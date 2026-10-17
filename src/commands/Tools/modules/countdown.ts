import { SlashCommandBuilder, MessageFlags, type ActionRowBuilder, type ButtonBuilder, type GuildTextBasedChannel, type Message } from 'discord.js';
import { successEmbed } from '../../../utils/embeds.js';
import { createError, ErrorTypes } from '../../../utils/errorHandler.js';
import { logger } from '../../../utils/logger.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { createControlButtons, formatTime, startCountdown } from '../../../handlers/countdownButtons.js';
import type { Command } from '../../../types/index.js';

/** Live countdown state, shared with handlers/countdownButtons. */
export interface CountdownData {
    message: Message;
    endTime: number;
    remainingTime: number;
    isPaused: boolean;
    title: string;
    lastUpdate: number;
    interval: ReturnType<typeof setInterval> | null;
}

const activeCountdowns = new Map<string, CountdownData>();

export { activeCountdowns };

export default {
    data: new SlashCommandBuilder()
        .setName("countdown")
        .setDescription("Starte einen Countdown")
        .addIntegerOption((option) =>
            option
                .setName("minutes")
                .setDescription("Anzahl der Minuten (0-1440)")
                .setMinValue(0)
                .setMaxValue(1440)
                .setRequired(false),
        )
        .addIntegerOption((option) =>
            option
                .setName("seconds")
                .setDescription("Anzahl der Sekunden (0-59)")
                .setMinValue(0)
                .setMaxValue(59)
                .setRequired(false),
        )
        .addStringOption((option) =>
            option
                .setName("title")
                .setDescription("Optionaler Titel für den Countdown")
                .setRequired(false),
        ),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Countdown interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'countdown'
            });
            return;
        }

        const minutes = interaction.options.getInteger("minutes") || 0;
        const seconds = interaction.options.getInteger("seconds") || 0;
        const title = interaction.options.getString("title") || "Countdown";

        const totalSeconds = minutes * 60 + seconds;

        if (totalSeconds <= 0) {
            throw createError("Please specify a duration of at least 1 second.", ErrorTypes.VALIDATION, "Bitte gib eine Dauer von mindestens 1 Sekunde an.", { expected: true });
        }

        if (totalSeconds > 86400) {
            throw createError("Countdown cannot be longer than 24 hours.", ErrorTypes.VALIDATION, "Ein Countdown darf höchstens 24 Stunden dauern.", { expected: true });
        }

        const endTime = Date.now() + totalSeconds * 1000;
        const countdownId = `${interaction.channelId}-${Date.now()}`;

        const row = createControlButtons(countdownId) as ActionRowBuilder<ButtonBuilder>;

        const initialEmbed = successEmbed(
            `⏱️ ${title}`,
            `Verbleibende Zeit: **${formatTime(totalSeconds)}**`,
        );

        const message = await (interaction.channel as GuildTextBasedChannel).send({
            embeds: [initialEmbed],
            components: [row],
        });

        const countdownData: CountdownData = {
            message,
            endTime,
            remainingTime: totalSeconds * 1000,
            isPaused: false,
            title,
            lastUpdate: Date.now(),
            interval: null,
        };

        activeCountdowns.set(countdownId, countdownData);
        startCountdown(countdownId, countdownData, activeCountdowns);

        await InteractionHelper.safeEditReply(interaction, {
            content: "✅ Countdown gestartet!",
            flags: MessageFlags.Ephemeral,
        });
    },
} satisfies Command;