import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
const activeCountdowns = new Map();

const createControlButtons = (countdownId, isPaused = false) => {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`countdown_pause_${countdownId}`)
            .setLabel(isPaused ? "â–¶ï¸ Resume" : "â¸ï¸ Pause")
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`countdown_cancel_${countdownId}`)
            .setLabel("âŒ Cancel")
            .setStyle(ButtonStyle.Danger),
    );
};
export default {
    data: new SlashCommandBuilder()
        .setName("countdown")
        .setDescription("Start a countdown timer")
        .addIntegerOption((option) =>
            option
                .setName("minutes")
                .setDescription("Number of minutes to count down (0-1440)")
                .setMinValue(0)
                .setMaxValue(1440)
                .setRequired(false),
        )
        .addIntegerOption((option) =>
            option
                .setName("seconds")
                .setDescription("Number of seconds to count down (0-59)")
                .setMinValue(0)
                .setMaxValue(59)
                .setRequired(false),
        )
        .addStringOption((option) =>
            option
                .setName("title")
                .setDescription("Optional title for the countdown")
                .setRequired(false),
        ),

    async execute(interaction) {
        try {
            const minutes = interaction.options.getInteger("minutes") || 0;
            const seconds = interaction.options.getInteger("seconds") || 0;
            const title = interaction.options.getString("title") || "Countdown Timer";

            const totalSeconds = minutes * 60 + seconds;

            if (totalSeconds <= 0) {
                throw new Error("Please specify a duration of at least 1 second.");
            }

            if (totalSeconds > 86400) {
                throw new Error("Countdown cannot be longer than 24 hours.");
            }

            const endTime = Date.now() + totalSeconds * 1000;
            const countdownId = `${interaction.channelId}-${Date.now()}`;

            const row = createControlButtons(countdownId);

            const initialEmbed = successEmbed(
                `â±ï¸ ${title}`,
                `Time remaining: **${formatTime(totalSeconds)}**`,
            );

            const message = await interaction.channel.send({
                embeds: [initialEmbed],
                components: [row],
            });

            const countdownData = {
                message,
                endTime,
                remainingTime: totalSeconds * 1000,
                isPaused: false,
                title,
                lastUpdate: Date.now(),
                interval: null,
            };

            startCountdown(countdownId, countdownData);

            activeCountdowns.set(countdownId, countdownData);

            const filter = (i) => {
                return i.customId.startsWith('countdown_') && 
                       i.customId.endsWith(countdownId) && 
                       i.user.id === interaction.user.id;
            };
            
            const collector = message.createMessageComponentCollector({ 
                filter, 
                time: totalSeconds * 1000 + 60000 
            });
            
            collector.on('collect', async (i) => {
                const [action, id] = i.customId.split('_').slice(1);
                
                if (id !== countdownId) return;
                
                const countdownData = activeCountdowns.get(countdownId);
                if (!countdownData) {
                    await i.reply({
                        content: "This countdown has expired or was cancelled.",
                        flags: ["Ephemeral"],
                    });
                    return;
                }

                if (!i.member.permissions.has("MANAGE_MESSAGES")) {
                    await i.reply({
                        content: 'You need the "Manage Messages" permission to control countdowns.',
                        flags: ["Ephemeral"],
                    });
                    return;
                }

                switch (action) {
                    case "pause":
                        if (countdownData.isPaused) {
                            countdownData.isPaused = false;
                            countdownData.endTime = Date.now() + countdownData.remainingTime;
                            startCountdown(countdownId, countdownData);

                            const currentEmbed = countdownData.message.embeds[0];
                            await countdownData.message.edit({
                                embeds: [currentEmbed],
                                components: [createControlButtons(countdownId, false)],
                            });

                            await i.reply({
                                content: "â–¶ï¸ Countdown resumed!",
                                flags: ["Ephemeral"],
                            });
                        } else {
                            clearInterval(countdownData.interval);
                            countdownData.isPaused = true;
                            countdownData.remainingTime = countdownData.endTime - Date.now();

                            const currentEmbed = countdownData.message.embeds[0];
                            await countdownData.message.edit({
                                embeds: [currentEmbed],
                                components: [createControlButtons(countdownId, true)],
                            });

                            await i.reply({
                                content: "â¸ï¸ Countdown paused!",
                                flags: ["Ephemeral"],
                            });
                        }
                        break;

                    case "cancel":
                        clearInterval(countdownData.interval);

                        const embed = successEmbed(
                            `â±ï¸ ${countdownData.title} (Cancelled)`,
                            "The countdown was cancelled.",
                        );

                        await countdownData.message.edit({
                            embeds: [embed],
                            components: [],
                        });

                        cleanupCountdown(countdownId);

                        await i.reply({
                            content: "âŒ Countdown cancelled!",
                            flags: ["Ephemeral"],
                        });
                        break;
                }
            });
            
            collector.on("end", () => {
                cleanupCountdown(countdownId);
            });

            await interaction.reply({
                content: "âœ… Countdown started!",
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            console.error("Countdown command error:", error);
            const replyMethod = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
            await interaction[replyMethod]({
                embeds: [
                    errorEmbed(
                        "Error",
                        "Failed to start the countdown. Please try again.",
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};

export async function handleCountdownInteraction(interaction) {
    if (!interaction.isButton()) return false;

    const [action, countdownId] = interaction.customId.split("_").slice(1);
    const countdownData = activeCountdowns.get(countdownId);

    if (!countdownData) {
        await interaction.editReply({
            content: "This countdown has expired or was cancelled.",
            flags: ["Ephemeral"],
        });
        return true;
    }

    if (!interaction.member.permissions.has("MANAGE_MESSAGES")) {
        await interaction.editReply({
            content:
                'You need the "Manage Messages" permission to control countdowns.',
            flags: ["Ephemeral"],
        });
        return true;
    }

    switch (action) {
        case "pause":
            if (countdownData.isPaused) {
                countdownData.isPaused = false;
                countdownData.endTime =
                    Date.now() + countdownData.remainingTime;
                startCountdown(countdownId, countdownData);

                const currentEmbed = countdownData.message.embeds[0];
                await countdownData.message.edit({
                    embeds: [currentEmbed],
                    components: [createControlButtons(countdownId, false)],
                });

                await interaction.editReply({
                    content: "â–¶ï¸ Countdown resumed!",
                    flags: ["Ephemeral"],
                });
            } else {
                clearInterval(countdownData.interval);
                countdownData.isPaused = true;
                countdownData.remainingTime =
                    countdownData.endTime - Date.now();

                const currentEmbed = countdownData.message.embeds[0];
                await countdownData.message.edit({
                    embeds: [currentEmbed],
                    components: [createControlButtons(countdownId, true)],
                });

                await interaction.editReply({
                    content: "â¸ï¸ Countdown paused!",
                    flags: ["Ephemeral"],
                });
            }
            break;

        case "cancel":
            clearInterval(countdownData.interval);

            const embed = successEmbed(
                `â±ï¸ ${countdownData.title} (Cancelled)`,
                "The countdown was cancelled.",
            );

            await countdownData.message.edit({
                embeds: [embed],
                components: [],
            });

            cleanupCountdown(countdownId);

            await interaction.editReply({
                content: "âŒ Countdown cancelled!",
                flags: ["Ephemeral"],
            });
            break;
    }

    return true;
}

function startCountdown(countdownId, countdownData) {
    if (countdownData.interval) {
        clearInterval(countdownData.interval);
        countdownData.interval = null;
    }

    console.log("Starting countdown with data:", {
        endTime: new Date(countdownData.endTime).toISOString(),
        remaining: countdownData.endTime - Date.now(),
    });

    countdownData.interval = setInterval(async () => {
        try {
            if (countdownData.isPaused) return;

            const now = Date.now();
            const remaining = Math.max(0, countdownData.endTime - now);
            countdownData.remainingTime = remaining;

            if (now - countdownData.lastUpdate >= 1000) {
                countdownData.lastUpdate = now;

                const embed = successEmbed(
                    `â±ï¸ ${countdownData.title}`,
                    `Time remaining: **${formatTime(Math.ceil(remaining / 1000))}**`,
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
                    console.error("Error updating countdown message:", error);
                }
            }

            if (remaining <= 0) {
                clearInterval(countdownData.interval);

                const finishedEmbed = successEmbed(
                    `â±ï¸ ${countdownData.title} (Finished!)`,
                    "â° Time's up!",
                );

                await countdownData.message.edit({
                    embeds: [finishedEmbed],
                    components: [],
                });

                cleanupCountdown(countdownId);
            }
        } catch (error) {
            console.error("Countdown update error:", error);
            cleanupCountdown(countdownId);
        }
    }, 100);
}

function cleanupCountdown(countdownId) {
    const countdownData = activeCountdowns.get(countdownId);
    if (countdownData) {
        clearInterval(countdownData.interval);
        activeCountdowns.delete(countdownId);
    }
}

function formatTime(seconds) {
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

