import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getGuildGiveaways, deleteGiveaway } from '../../utils/giveaways.js';
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
.setDefaultMemberPermissions(0x0000000000000008n),

    async execute(interaction) {
        try {
            if (!interaction.inGuild()) {
                throw new Error("This command can only be used in a server.");
            }

            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                throw new Error("You need the 'Manage Server' permission to delete a giveaway.");
            }

            const messageId = interaction.options.getString("messageid");
            const giveaways = await getGuildGiveaways(interaction.client, interaction.guildId);
            const giveaway = giveaways.find(g => g.messageId === messageId);

            if (!giveaway) {
                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "Giveaway Not Found",
                            "No giveaway was found with that message ID.",
                        ),
                    ],
                    ephemeral: true,
                });
            }

            let deletedMessage = false;
            let channelName = "Unknown Channel";

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

            await deleteGiveaway(
                interaction.client,
                interaction.guildId,
                messageId,
            );

            const statusMsg = deletedMessage
                ? `and the message was deleted from #${channelName}`
                : `but the message was already deleted or the channel was inaccessible.`;

            return interaction.reply({
                embeds: [
                    successEmbed(
                        "Giveaway Deleted",
                        `Successfully deleted the giveaway for **${giveaway.prize}** ${statusMsg}. No winner was picked.`,
                    ),
                ],
                ephemeral: true,
            });
        } catch (error) {
            console.error("Error deleting giveaway:", error);
            const replyMethod = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
            return interaction[replyMethod]({
                embeds: [
                    errorEmbed(
                        "Deletion Failed",
                        "An error occurred while trying to delete the giveaway. Check bot permissions.",
                    ),
                ],
                ephemeral: true,
            });
        }
    },
};
