import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { giveawayEmbed, giveawayButtons, getGuildGiveaways, saveGiveaway, pickWinners, deleteGiveaway } from '../../utils/giveaways.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
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
.setDefaultMemberPermissions(0x0000000000000008n),

    async execute(interaction) {
        try {
            if (!interaction.inGuild()) {
                throw new Error("This command can only be used in a server.");
            }

            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                throw new Error("You need the 'Manage Server' permission to end a giveaway.");
            }

            const messageId = interaction.options.getString("messageid");
            const giveaways = await getGuildGiveaways(interaction.client, interaction.guildId);
            const giveaway = giveaways.find(g => g.messageId === messageId);

            if (!giveaway) {
                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "Giveaway Not Found",
                            "No giveaway was found with that message ID in the database.",
                        ),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            }

            if (giveaway.isEnded) {
                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "Giveaway Already Ended",
                            "This giveaway has already finished.",
                        ),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            }

            const winners = pickWinners(giveaway.participants || [], giveaway.winnerCount);
const winnerIds = winners.map((w) => w);

            const channel = await interaction.client.channels.fetch(
                giveaway.channelId,
            );
            if (!channel || !channel.isTextBased()) {
                await deleteGiveaway(
                    interaction.client,
                    interaction.guildId,
                    messageId,
                );
                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "Channel Error",
                            "Could not find the channel where the giveaway was hosted. The giveaway has been removed from the database.",
                        ),
                    ],
                    flags: MessageFlags.Ephemeral,
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
                return interaction.reply({
                    embeds: [
                        errorEmbed(
                            "Message Error",
                            "Could not find the giveaway message. The giveaway has been removed from the database.",
                        ),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            }

            giveaway.isEnded = true;
giveaway.winnerIds = winnerIds;
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

            if (winnerIds.length > 0) {
                const winnerMentions = winnerIds
                    .map((id) => `<@${id}>`)
                    .join(", ");
                await channel.send({
                    content: `CONGRATULATIONS ${winnerMentions}! You won the **${giveaway.prize}** giveaway! Please contact the host <@${giveaway.hostId}> to claim your prize.`,
                });

                try {
                    await logEvent({
                        client: interaction.client,
                        guildId: interaction.guildId,
                        eventType: EVENT_TYPES.GIVEAWAY_WINNER,
                        data: {
                            description: `Giveaway ended with ${winnerIds.length} winner(s)`,
                            channelId: giveaway.channelId,
                            userId: interaction.user.id,
                            fields: [
                                {
                                    name: '🎁 Prize',
                                    value: giveaway.prize || 'Mystery Prize!',
                                    inline: true
                                },
                                {
                                    name: '🏆 Winners',
                                    value: winnerMentions,
                                    inline: false
                                },
                                {
                                    name: '📍 Channel',
                                    value: channel.toString(),
                                    inline: true
                                }
                            ]
                        }
                    });
                } catch (error) {
                    console.debug('Error logging giveaway end:', error);
                }
            } else {
                await channel.send({
                    content: `The giveaway for **${giveaway.prize}** has ended with no valid entries.`,
                });
            }

            return interaction.reply({
                embeds: [
                    successEmbed(
                        "Giveaway Ended",
                        `Successfully ended the giveaway for **${giveaway.prize}** in ${channel}.`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            console.error("Error ending giveaway:", error);
            const replyMethod = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
            return interaction[replyMethod]({
                embeds: [
                    errorEmbed(
                        "Giveaway Failed",
                        "An error occurred while trying to end the giveaway and update the message.",
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};



