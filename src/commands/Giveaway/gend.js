import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { giveawayEmbed, giveawayButtons, getGuildGiveaways, saveGiveaway, pickWinners } from '../../utils/giveaways.js';

// Migrated from: commands/Giveaway/gend.js
export default {
    data: new SlashCommandBuilder()
        .setName("gend")
        .setDescription(
            "Ends an active giveaway immediately and picks the winner(s).",
        )
        .addStringOption((option) =>
            option
                .setName("messageid")
                .setDescription("The message ID of the giveaway to end.")
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
                        "You need the 'Manage Server' permission to end a giveaway.",
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
        let giveaway = giveaways[messageId];

        if (!giveaway) {
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Giveaway Not Found",
                        "No giveaway was found with that message ID in the database.",
                    ),
                ],
            });
        }

        if (giveaway.isEnded) {
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Giveaway Already Ended",
                        "This giveaway has already finished.",
                    ),
                ],
            });
        }

        try {
            // 1. Pick Winner(s) - Use 'participants' for consistency with gcreate
            const winners = pickWinners(giveaway.participants || [], giveaway.winnerCount);
            const winnerIds = winners.map((w) => w); // Store raw IDs

            // 2. Locate the message and channel
            const channel = await interaction.client.channels.fetch(
                giveaway.channelId,
            );
            if (!channel || !channel.isTextBased()) {
                await deleteGiveaway(
                    interaction.client,
                    interaction.guildId,
                    messageId,
                );
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Channel Error",
                            "Could not find the channel where the giveaway was hosted. The giveaway has been removed from the database.",
                        ),
                    ],
                });
            }

            const message = await channel.messages
                .fetch(messageId)
                .catch(() => null);
            if (!message) {
                await deleteGiveaway(
                    interaction.client,
                    interaction.guildId,
                    messageId,
                );
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Message Error",
                            "Could not find the giveaway message. The giveaway has been removed from the database.",
                        ),
                    ],
                });
            }

            // 3. Update the database and message
            giveaway.isEnded = true;
            giveaway.winnerIds = winnerIds; // Store the winning IDs
            await saveGiveaway(
                interaction.client,
                interaction.guildId,
                giveaway,
            );

            const newEmbed = giveawayEmbed(giveaway, "ended", winnerIds);
            const newRow = giveawayButtons(true);

            await message.edit({
                content: "🎉 **GIVEAWAY ENDED** 🎉",
                embeds: [newEmbed],
                components: [newRow],
            });

            // 4. Announce winner(s) in the channel
            if (winnerIds.length > 0) {
                const winnerMentions = winnerIds
                    .map((id) => `<@${id}>`)
                    .join(", ");
                await channel.send({
                    content: `CONGRATULATIONS ${winnerMentions}! You won the **${giveaway.prize}** giveaway! Please contact the host <@${giveaway.hostId}> to claim your prize.`,
                });
            } else {
                await channel.send({
                    content: `The giveaway for **${giveaway.prize}** has ended with no valid entries.`,
                });
            }

            return interaction.editReply({
                embeds: [
                    successEmbed(
                        "Giveaway Ended",
                        `Successfully ended the giveaway for **${giveaway.prize}** in ${channel}.`,
                    ),
                ],
            });
        } catch (error) {
            console.error("Error ending giveaway:", error);
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Giveaway Failed",
                        "An error occurred while trying to end the giveaway and update the message.",
                    ),
                ],
            });
        }
    },
};
