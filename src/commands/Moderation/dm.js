import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { logEvent } from '../../utils/moderation.js';

// Migrated from: commands/Moderation/dm.js
export default {
    data: new SlashCommandBuilder()
        .setName("dm")
        .setDescription("Send a direct message to a user (Staff only)")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("The user to send a DM to")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("message")
                .setDescription("The message to send")
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option
                .setName("anonymous")
                .setDescription("Send the message anonymously (default: false)")
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false),
    category: "Moderation",

    async execute(interaction, config) {
        await interaction.deferReply({ flags: ["Ephemeral"] });

        const targetUser = interaction.options.getUser("user");
        const message = interaction.options.getString("message");
        const anonymous = interaction.options.getBoolean("anonymous") || false;

        try {
            // Try to send the DM
            const dmChannel = await targetUser.createDM();
            
            await dmChannel.send({
                embeds: [
                    successEmbed(
                        anonymous ? "Message from the Staff Team" : `Message from ${interaction.user.tag}`,
                        message
                    ).setFooter({
                        text: `You cannot reply to this message.`
                    })
                ]
            });

            // Log the action using the proper logging system
            await logEvent({
                client: interaction.client,
                guild: interaction.guild,
                event: {
                    action: "DM Sent",
                    target: `${targetUser.tag} (${targetUser.id})`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason: `Anonymous: ${anonymous ? 'Yes' : 'No'}\nMessage: ${message}`,
                    metadata: {
                        userId: targetUser.id,
                        moderatorId: interaction.user.id,
                        anonymous,
                        messageLength: message.length
                    }
                }
            });

            return interaction.editReply({
                embeds: [
                    successEmbed(
                        "DM Sent",
                        `Successfully sent a message to ${targetUser.tag}`
                    ),
                ],
            });
        } catch (error) {
            console.error("Error in dm command:", error);
            
            if (error.code === 50007) { // Cannot send messages to this user
                return interaction.editReply({
                    embeds: [
                        errorEmbed("Error", `Could not send a DM to ${targetUser.tag}. They may have DMs disabled.`),
                    ],
                });
            }
            
            return interaction.editReply({
                embeds: [
                    errorEmbed("Error", `Failed to send DM: ${error.message}`),
                ],
            });
        }
    },
};
