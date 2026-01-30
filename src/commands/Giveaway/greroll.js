import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { giveawayEmbed, giveawayButtons, getGuildGiveaways, saveGiveaway, pickWinners } from '../../utils/giveaways.js';

// Migrated from: commands/Giveaway/greroll.js
export default {
    data: new SlashCommandBuilder()
        .setName("greroll")
        .setDescription("Rerolls the winner(s) for an ended giveaway.")
        .addStringOption((option) =>
            option
                .setName("messageid")
                .setDescription("The message ID of the ended giveaway.")
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
                        "You need the 'Manage Server' permission to reroll a giveaway.",
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

        if (!giveaway.isEnded) {
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Giveaway Not Ended",
                        "This giveaway is still active. Please use `/gend` to end it first.",
                    ),
                ],
            });
        }

        // Use 'participants' for consistency with gcreate
        const participants = giveaway.participants || [];
        
        if (participants.length < giveaway.winnerCount) {
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Reroll Failed",
                        "Not enough entries to pick the required number of winners.",
                    ),
                ],
            });
        }

        try {
            // 1. Pick New Winner(s)
            const newWinners = pickWinners(
                participants,
                giveaway.winnerCount,
            );
            const newWinnerIds = newWinners.map((w) => w);

            // 2. Locate the message and channel
            const channel = await interaction.client.channels.fetch(
                giveaway.channelId,
            );
            if (!channel || !channel.isTextBased()) {
                // If channel is gone, just update DB and return
                giveaway.winnerIds = newWinnerIds;
                await saveGiveaway(
                    interaction.client,
                    interaction.guildId,
                    giveaway,
                );
                return interaction.editReply({
                    embeds: [
                        successEmbed(
                            "Reroll Complete",
                            "The new winners have been selected and saved to the database. Could not find channel to announce.",
                        ),
                    ],
                });
            }

            const message = await channel.messages
                .fetch(messageId)
                .catch(() => null);
            if (!message) {
                // If message is gone, update DB and announce in reply
                giveaway.winnerIds = newWinnerIds;
                await saveGiveaway(
                    interaction.client,
                    interaction.guildId,
                    giveaway,
                );
                const winnerMentions = newWinnerIds
                    .map((id) => `<@${id}>`)
                    .join(", ");
                await channel.send({
                    content: `🎉 **GIVEAWAY REROLL** 🎉 New winners for **${giveaway.prize}**: ${winnerMentions}!`,
                });
                return interaction.editReply({
                    embeds: [
                        successEmbed(
                            "Reroll Complete",
                            `The new winners have been announced in ${channel}. (Original message not found).`,
                        ),
                    ],
                });
            }

            // 3. Update the database and message
            giveaway.winnerIds = newWinnerIds; // Overwrite previous winners
            await saveGiveaway(
                interaction.client,
                interaction.guildId,
                giveaway,
            );

            const newEmbed = giveawayEmbed(giveaway, "reroll", newWinnerIds);
            const newRow = giveawayButtons(true); // Still ended

            await message.edit({
                content: "🔄 **GIVEAWAY REROLLED** 🔄",
                embeds: [newEmbed],
                components: [newRow],
            });

            // 4. Announce new winner(s) in the channel
            const winnerMentions = newWinnerIds
                .map((id) => `<@${id}>`)
                .join(", ");
            await channel.send({
                content: `🔄 **REROLL WINNERS** 🔄 CONGRATULATIONS ${winnerMentions}! You are the new winner(s) for the **${giveaway.prize}** giveaway! Please contact the host <@${giveaway.hostId}> to claim your prize.`,
            });

            return interaction.editReply({
                embeds: [
                    successEmbed(
                        "Reroll Successful",
                        `Successfully rerolled the giveaway for **${giveaway.prize}** in ${channel}.`,
                    ),
                ],
            });
        } catch (error) {
            console.error("Error rerolling giveaway:", error);
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Reroll Failed",
                        "An unexpected error occurred while trying to reroll the giveaway.",
                    ),
                ],
            });
        }
    },
};
