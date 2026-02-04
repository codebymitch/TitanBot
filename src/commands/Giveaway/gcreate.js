import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { giveawayEmbed, giveawayButtons, saveGiveaway } from '../../utils/giveaways.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

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
        .setDescription("Starts a new giveaway in a specified channel.")
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
        .addChannelOption((option) =>
            option
                .setName("channel")
                .setDescription("The channel to send the giveaway to (defaults to current channel).")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false),
        )
        .setDefaultMemberPermissions(0x0000000000000008n), // Administrator permission

    async execute(interaction) {
        try {
            await InteractionHelper.safeExecute(
                interaction,
                async () => {
        if (!interaction.inGuild()) {
            throw new Error("This command can only be used in a server.");
        }

        if (
            !interaction.member.permissions.has(
                PermissionsBitField.Flags.ManageGuild,
            )
        ) {
            throw new Error("You need the 'Manage Server' permission to start a giveaway.");
        }

        const durationString = interaction.options.getString("duration");
        const winnerCount = interaction.options.getInteger("winners");
        const prize = interaction.options.getString("prize");
        const targetChannel = interaction.options.getChannel("channel") || interaction.channel;

        const durationMs = parseDuration(durationString);

        if (durationMs === null) {
            throw new Error("Invalid duration format. Use: 1h, 30m, 5d, 10s (min: 10s, max: 30d)");
        }

        const endTime = Date.now() + durationMs;

        // Create giveaway data
        const initialGiveawayData = {
            messageId: "placeholder",
            channelId: targetChannel.id,
            guildId: interaction.guildId,
            prize: prize,
            hostId: interaction.user.id,
            endTime: endTime,
            endsAt: endTime,
            winnerCount: winnerCount,
            participants: [],
            isEnded: false,
        };

        // Send giveaway message
        const embed = giveawayEmbed(initialGiveawayData, "active");
        const row = giveawayButtons(false);
        const giveawayMessage = await targetChannel.send({
            content: "🎉 **NEW GIVEAWAY** 🎉",
            embeds: [embed],
            components: [row],
        });

        // Update message ID and save to database
        initialGiveawayData.messageId = giveawayMessage.id;
        await saveGiveaway(
            interaction.client,
            interaction.guildId,
            initialGiveawayData,
        );

        // Confirm success
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    "Giveaway Started!",
                    `A new giveaway for **${prize}** has been started in ${targetChannel} and will end in ${durationString}.`,
                ),
            ],
        });
                },
                errorEmbed("Giveaway Failed", "There was an error starting the giveaway. Please check bot permissions and ensure the channel is text-based.")
            );
        } catch (error) {
            console.error('Gcreate command error:', error);
            return interaction.reply({
                embeds: [errorEmbed('System Error', 'Could not start giveaway at this time.')],
                ephemeral: true,
            });
        }
    },
};
