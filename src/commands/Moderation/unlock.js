import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { logEvent } from '../../utils/moderation.js';

export default {
    data: new SlashCommandBuilder()
        .setName("unlock")
        .setDescription(
            "Unlocks the current channel (allows @everyone to send messages again).",
        )
.setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    category: "moderation",

    async execute(interaction, config, client) {

        if (
            !interaction.member.permissions.has(
                PermissionFlagsBits.ManageChannels,
            )
        )
            return await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Permission Denied",
                        "You need the `Manage Channels` permission to unlock channels.",
                    ),
                ],
            });

        const channel = interaction.channel;
        const everyoneRole = interaction.guild.roles.everyone;

        try {
            const currentPermissions = channel.permissionsFor(everyoneRole);
            if (
                currentPermissions.has(PermissionFlagsBits.SendMessages) ===
                    true ||
                currentPermissions.has(PermissionFlagsBits.SendMessages) ===
                    null
            ) {
                return await interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Channel Already Unlocked",
                            `${channel} is not explicitly locked (everyone can already send messages).`,
                        ),
                    ],
                });
            }

            await channel.permissionOverwrites.edit(
                everyoneRole,
                { SendMessages: true },
                {
                    type: 0,
                    reason: `Channel unlocked by ${interaction.user.tag}`,
},
            );

            const unlockEmbed = createEmbed(
                "🔓 Channel Unlocked (Action Log)",
                `${channel} has been unlocked by ${interaction.user}.`,
            )
.setColor("#2ECC71")
                .addFields(
                    {
                        name: "Channel",
                        value: channel.toString(),
                        inline: true,
                    },
                    {
                        name: "Moderator",
                        value: `${interaction.user.tag} (${interaction.user.id})`,
                        inline: true,
                    },
                );

            await logEvent({
                client,
                guild: interaction.guild,
                event: {
                    action: "Channel Unlocked",
                    target: channel.toString(),
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    metadata: {
                        channelId: channel.id,
                        category: channel.parent?.name || 'None'
                    }
                }
            });

            await interaction.editReply({
                embeds: [
                    successEmbed(
                        `🔓 **Channel Unlocked**`,
                        `${channel} is now unlocked. You may speak now.`,
                    ),
                ],
            });
        } catch (error) {
            console.error("Unlock Error:", error);
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "An unexpected error occurred while trying to unlock the channel. Check my permissions (I need 'Manage Channels').",
                    ),
                ],
            });
        }
    }
};
