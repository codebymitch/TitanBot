import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getGuildGiveaways, deleteGiveaway } from '../../utils/giveaways.js';

// Migrated from: commands/Giveaway/gdelete.js
export default {
    data: new SlashCommandBuilder()
        .setName("gdelete")
        .setDescription(
            "Deletes a giveaway message and removes it from the database (no winner picked).",
        )
        .addStringOption((option) =>
            option
                .setName("messageid")
                .setDescription("The message ID of the giveaway to delete.")
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
                flags: ["Ephemeral"],
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
                        "You need the 'Manage Server' permission to delete a giveaway.",
                    ),
                ],
                flags: ["Ephemeral"],
            });
        }

        await interaction.deferReply({ flags: ["Ephemeral"] });

        const messageId = interaction.options.getString("messageid");
        const giveaways = await getGuildGiveaways(
            interaction.client,
            interaction.guildId,
        );
        const giveaway = giveaways[messageId];

        if (!giveaway) {
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Giveaway Not Found",
                        "No giveaway was found with that message ID.",
                    ),
                ],
            });
        }

        try {
            let deletedMessage = false;
            let channelName = "Unknown Channel";

            // 1. Locate and delete the message
            const channel = await interaction.client.channels
                .fetch(giveaway.channelId)
                .catch(() => null);
            if (channel && channel.isTextBased()) {
                channelName = channel.name;
                const message = await channel.messages
                    .fetch(messageId)
                    .catch(() => null);
                if (message) {
                    await message.delete();
                    deletedMessage = true;
                }
            }

            // 2. Delete the database entry
            await deleteGiveaway(
                interaction.client,
                interaction.guildId,
                messageId,
            );

            // 3. Send confirmation
            const statusMsg = deletedMessage
                ? `and the message was deleted from #${channelName}`
                : `but the message was already deleted or the channel was inaccessible.`;

            return interaction.editReply({
                embeds: [
                    successEmbed(
                        "Giveaway Deleted",
                        `Successfully deleted the giveaway for **${giveaway.prize}** ${statusMsg}. No winner was picked.`,
                    ),
                ],
            });
        } catch (error) {
            console.error("Error deleting giveaway:", error);
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Deletion Failed",
                        "An error occurred while trying to delete the giveaway. Check bot permissions.",
                    ),
                ],
            });
        }
    },
};
