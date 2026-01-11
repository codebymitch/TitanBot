import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Moderation/unlock.js
export default {
    data: new SlashCommandBuilder()
        .setName("unlock")
        .setDescription(
            "Unlocks the current channel (allows @everyone to send messages again).",
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels), // Requires Manage Channels permission
    category: "moderation",

    async execute(interaction, config, client) {
        // Defer reply for potential API latency
        await interaction.deferReply({ ephemeral: true });

        // Ensure user has permission
        if (
            !interaction.member.permissions.has(
                PermissionFlagsBits.ManageChannels,
            )
        )
            return interaction.editReply({
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
            // Check if the channel is already unlocked (optional but good UX)
            const currentPermissions = channel.permissionsFor(everyoneRole);
            // Check if SendMessages is explicitly allowed or neutral (which is treated as allowed if no deny is present)
            // It's "locked" if SendMessages is explicitly denied.
            if (
                currentPermissions.has(PermissionFlagsBits.SendMessages) ===
                    true ||
                currentPermissions.has(PermissionFlagsBits.SendMessages) ===
                    null
            ) {
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Channel Already Unlocked",
                            `${channel} is not explicitly locked (everyone can already send messages).`,
                        ),
                    ],
                });
            }

            // Unlock the channel: Explicitly set the SendMessages permission for @everyone to true (neutralizes the lock)
            await channel.permissionOverwrites.edit(
                everyoneRole,
                { SendMessages: true },
                {
                    type: 0,
                    reason: `Channel unlocked by ${interaction.user.tag}`,
                }, // type 0 is the default role type
            );

            // --- LOGGING THE ACTION ---
            const unlockEmbed = createEmbed(
                "🔓 Channel Unlocked (Action Log)",
                `${channel} has been unlocked by ${interaction.user}.`,
            )
                .setColor("#2ECC71") // Green for Reverting Restriction
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

            logEvent(client, interaction.guildId, unlockEmbed);
            // ---------------------------

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
    },
};
