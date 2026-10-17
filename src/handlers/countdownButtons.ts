import { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import type { ButtonInteraction, GuildMember } from 'discord.js';
import type { CountdownData } from '../commands/Tools/modules/countdown.js';
import type { NexoClient } from '../types/index.js';
import { successEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';

import { replyUserError, ErrorTypes } from '../utils/errorHandler.js';
function createControlButtons(countdownId: string, isPaused = false): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`countdown_pause:${countdownId}`)
            .setLabel(isPaused ? "▶️ Fortsetzen" : "⏸️ Pausieren")
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`countdown_cancel:${countdownId}`)
            .setLabel("❌ Abbrechen")
            .setStyle(ButtonStyle.Danger),
    );
}

function formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    return [
        h > 0 ? h.toString().padStart(2, "0") : null,
        m.toString().padStart(2, "0"),
        s.toString().padStart(2, "0"),
    ]
        .filter(Boolean)
        .join(":");
}

function startCountdown(countdownId: string, countdownData: CountdownData, activeCountdowns: Map<string, CountdownData>): void {
    if (countdownData.interval) {
        clearInterval(countdownData.interval);
        countdownData.interval = null;
    }

    logger.info(`Countdown started: ${countdownData.title} (${countdownData.remainingTime / 1000}s remaining)`);

    countdownData.interval = setInterval(async () => {
        try {
            if (countdownData.isPaused) return;

            const now = Date.now();
            const remaining = Math.max(0, countdownData.endTime - now);
            countdownData.remainingTime = remaining;

            if (now - countdownData.lastUpdate >= 1000) {
                countdownData.lastUpdate = now;

                const embed = successEmbed(
                    `⏱️ ${countdownData.title}`,
                    `Verbleibende Zeit: **${formatTime(Math.ceil(remaining / 1000))}**`,
                );

                try {
                    await countdownData.message.edit({
                        embeds: [embed],
                        components: [
                            createControlButtons(
                                countdownId,
                                countdownData.isPaused,
                            ),
                        ],
                    });
                } catch (error) {
                    logger.error("Error updating countdown message:", error);
                }
            }

            if (remaining <= 0) {
                clearInterval(countdownData.interval!);

                const finishedEmbed = successEmbed(
                    `⏱️ ${countdownData.title} (Beendet!)`,
                    "⏰ Die Zeit ist um!",
                );

                await countdownData.message.edit({
                    embeds: [finishedEmbed],
                    components: [],
                });

                cleanupCountdown(countdownId, activeCountdowns);
            }
        } catch (error) {
            logger.error("Countdown update error:", error);
            cleanupCountdown(countdownId, activeCountdowns);
        }
    }, 100);
}

function cleanupCountdown(countdownId: string, activeCountdowns: Map<string, CountdownData>): void {
    const countdownData = activeCountdowns.get(countdownId);
    if (countdownData) {
        clearInterval(countdownData.interval!);
        activeCountdowns.delete(countdownId);
    }
}

async function countdownButtonHandler(interaction: ButtonInteraction, client: NexoClient, args: string[]): Promise<unknown> {
    try {
        const { activeCountdowns } = await import('../commands/Tools/modules/countdown.js');
        const action = args[0];
        const countdownId = args[1];

        const countdownData = activeCountdowns.get(countdownId);
        if (!countdownData) {
            return await interaction.reply({
                content: "Dieser Countdown ist abgelaufen oder wurde abgebrochen.",
                flags: ["Ephemeral"],
            });
        }

        if (!(interaction.member as GuildMember).permissions.has(PermissionFlagsBits.ManageMessages)) {
            return await interaction.reply({
                content: 'Du brauchst die Berechtigung „Nachrichten verwalten“, um Countdowns zu steuern.',
                flags: ["Ephemeral"],
            });
        }

        switch (action) {
            case "pause":
                if (countdownData.isPaused) {
                    countdownData.isPaused = false;
                    countdownData.endTime = Date.now() + countdownData.remainingTime;
                    startCountdown(countdownId, countdownData, activeCountdowns);

                    const currentEmbed = countdownData.message.embeds[0];
                    await countdownData.message.edit({
                        embeds: [currentEmbed],
                        components: [createControlButtons(countdownId, false)],
                    });

                    await interaction.reply({
                        content: "▶️ Countdown fortgesetzt!",
                        flags: ["Ephemeral"],
                    });
                } else {
                    clearInterval(countdownData.interval!);
                    countdownData.isPaused = true;
                    countdownData.remainingTime = countdownData.endTime - Date.now();

                    const currentEmbed = countdownData.message.embeds[0];
                    await countdownData.message.edit({
                        embeds: [currentEmbed],
                        components: [createControlButtons(countdownId, true)],
                    });

                    await interaction.reply({
                        content: "⏸️ Countdown pausiert!",
                        flags: ["Ephemeral"],
                    });
                }
                break;

            case "cancel":
                clearInterval(countdownData.interval!);

                const embed = successEmbed(
                    `⏱️ ${countdownData.title} (Abgebrochen)`,
                    "Der Countdown wurde abgebrochen.",
                );

                await countdownData.message.edit({
                    embeds: [embed],
                    components: [],
                });

                cleanupCountdown(countdownId, activeCountdowns);

                await interaction.reply({
                    content: "❌ Countdown abgebrochen!",
                    flags: ["Ephemeral"],
                });
                break;
        }
    } catch (error) {
        logger.error('Countdown button handler error:', error);
        try {
            if (!interaction.replied && !interaction.deferred) {
                await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Steuern des Countdowns ist ein Fehler aufgetreten.' });
            }
        } catch (err) {
            logger.error('Failed to send error message:', err);
        }
    }
}

export { createControlButtons, formatTime, startCountdown, cleanupCountdown, countdownButtonHandler };
export default countdownButtonHandler;