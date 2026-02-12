import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
export default {
    data: new SlashCommandBuilder()
        .setName("unban")
        .setDescription("Unban a user from the server")
        .addUserOption(option =>
            option
                .setName("target")
                .setDescription("The user to unban (can be ID or mention)")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("reason")
                .setDescription("Reason for the unban")
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        try {
                if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
                    throw new Error("You do not have permission to unban members.");
                }

                const targetUser = interaction.options.getUser("target");
                const reason = interaction.options.getString("reason") || "No reason provided";

                const banList = await interaction.guild.bans.fetch();
                const banInfo = banList.get(targetUser.id);

                if (!banInfo) {
                    throw new Error(`${targetUser.tag} is not currently banned from this server.`);
                }

                await interaction.guild.members.unban(targetUser.id, reason);

                await logModerationAction({
                    client,
                    guild: interaction.guild,
                    event: {
                        action: "Member Unbanned",
                        target: `${targetUser.tag} (${targetUser.id})`,
                        executor: `${interaction.user.tag} (${interaction.user.id})`,
                        reason,
                        metadata: {
                            userId: targetUser.id,
                            moderatorId: interaction.user.id
                        }
                    }
                });

                await interaction.editReply({
                    embeds: [
                        successEmbed(
                            "âœ… User Unbanned",
                            `Successfully unbanned **${targetUser.tag}** from the server.\n\n**Reason:** ${reason}\n**Moderator:** ${interaction.user.tag}`
                        )
                    ]
                });
        } catch (error) {
            logger.error('Unban command error:', error);
            throw error;
        }
    }
};

