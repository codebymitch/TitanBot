import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

const parseDuration = (durationString) => {
    // Regex to match formats like "1h", "30m", "5d", "10s"
    const regex = /(\d+)([hmds])/i;
    const match = durationString.match(regex);

    if (!match) return null;

    const amount = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    let ms = 0;

    switch (unit) {
        case "s":
            ms = amount * 1000;
            break;
        case "m":
            ms = amount * 60 * 1000;
            break;
        case "h":
            ms = amount * 60 * 60 * 1000;
            break;
        case "d":
            ms = amount * 24 * 60 * 60 * 1000;
            break;
        default:
            return null;
    }

    // Cap duration to 30 days
    const maxDuration = 30 * 24 * 60 * 60 * 1000;
    if (ms > maxDuration) {
        return maxDuration;
    }
    // Minimum duration 10 seconds (for testing, usually 1 minute)
    const minDuration = 10 * 1000;
    if (ms < minDuration) {
        // If the duration is too short, default to the minimum
        return minDuration;
    }

    return ms;
};
// Migrated from: commands/Giveaway/gcreate.js
export default {
    data: new SlashCommandBuilder()
        .setName("gcreate")
        .setDescription("Starts a new giveaway in the current channel.")
        .addStringOption((option) =>
            option
                .setName("duration")
                .setDescription(
                    "How long the giveaway should last (e.g., 1h, 30m, 5d).",
                )
                .setRequired(true),
        )
        .addIntegerOption((option) =>
            option
                .setName("winners")
                .setDescription("The number of winners to pick.")
                .setMinValue(1)
                .setMaxValue(10)
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName("prize")
                .setDescription("The prize being given away.")
                .setRequired(true),
        )
        .setDefaultMemberPermissions(0x0000000000000008n), // Administrator permission

    async execute(interaction) {
        if (!interaction.inGuild()) {
            return interaction.reply({
                embeds: [
                    errorEmbed(
                        "Command Failed",
                        "This command can only be used in a server.",
                    ),
                ],
                ephemeral: true,
            });
        }

        if (
            !interaction.member.permissions.has(
                PermissionsBitField.Flags.ManageGuild,
            )
        ) {
            return interaction.reply({
                embeds: [
                    errorEmbed(
                        "Permission Denied",
                        "You need the 'Manage Server' permission to start a giveaway.",
                    ),
                ],
                ephemeral: true,
            });
        }

        await interaction.deferReply();

        const durationString = interaction.options.getString("duration");
        const winnerCount = interaction.options.getInteger("winners");
        const prize = interaction.options.getString("prize");

        const durationMs = parseDuration(durationString);

        if (durationMs === null) {
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Invalid Duration",
                        "Please provide a valid duration (e.g., `1h`, `30m`, `5d`, `10s`). Minimum is 10s, maximum is 30d.",
                    ),
                ],
            });
        }

        const endTime = Date.now() + durationMs;

        try {
            // 1. Send the initial giveaway message
            const initialGiveawayData = {
                messageId: "placeholder", // Will be updated after sending the message
                channelId: interaction.channelId,
                guildId: interaction.guildId,
                prize: prize,
                hostId: interaction.user.id,
                endTime: endTime,
                winnerCount: winnerCount,
                // ** 🚩 FIX: Use 'participants' for consistency with the rest of the logic **
                participants: [],
                isEnded: false,
            };

            const embed = giveawayEmbed(initialGiveawayData, "active");
            // Pass the initial entry count (0) to the button helper
            const row = giveawayButtons(
                false,
                initialGiveawayData.participants.length,
            );

            const giveawayMessage = await interaction.channel.send({
                content: "🎉 **NEW GIVEAWAY** 🎉",
                embeds: [embed],
                components: [row],
            });

            // 2. Update the message ID and save to database
            initialGiveawayData.messageId = giveawayMessage.id;
            await saveGiveaway(
                interaction.client,
                interaction.guildId,
                initialGiveawayData,
            );

            // 3. Inform the user the giveaway has started
            return interaction.editReply({
                embeds: [
                    successEmbed(
                        "Giveaway Started!",
                        `A new giveaway for **${prize}** has been successfully started in ${interaction.channel} and will end in ${durationString}.`,
                    ),
                ],
            });
        } catch (error) {
            console.error("Error starting giveaway:", error);
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Giveaway Failed",
                        "There was an error starting the giveaway. Please check bot permissions and ensure the channel is text-based.",
                    ),
                ],
            });
        }
    },
};
