import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { giveawayEmbed, giveawayButtons, saveGiveaway } from '../../utils/giveaways.js';
const parseDuration = (durationString) => {
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

    const maxDuration = 30 * 24 * 60 * 60 * 1000;
    if (ms > maxDuration) {
        return maxDuration;
    }
    const minDuration = 10 * 1000;
    if (ms < minDuration) {
        return minDuration;
    }

    return ms;
};
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
.setDefaultMemberPermissions(0x0000000000000008n),

    async execute(interaction) {
        try {
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

            const embed = giveawayEmbed(initialGiveawayData, "active");
            const row = giveawayButtons(false);
            const giveawayMessage = await targetChannel.send({
                content: "ðŸŽ‰ **NEW GIVEAWAY** ðŸŽ‰",
                embeds: [embed],
                components: [row],
            });

            initialGiveawayData.messageId = giveawayMessage.id;
            await saveGiveaway(
                interaction.client,
                interaction.guildId,
                initialGiveawayData,
            );

            await interaction.reply({
                embeds: [
                    successEmbed(
                        "Giveaway Started!",
                        `A new giveaway for **${prize}** has been started in ${targetChannel} and will end in ${durationString}.`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            console.error('Gcreate command error:', error);
            const replyMethod = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
            return interaction[replyMethod]({
                embeds: [errorEmbed('System Error', 'Could not start giveaway at this time.')],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};

