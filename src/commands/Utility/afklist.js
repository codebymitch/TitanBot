import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { getAFKStatus } from '../../utils/afk.js';

export default {
    data: new SlashCommandBuilder()
        .setName("afklist")
        .setDescription("List all users who are currently AFK in this server")
        .addIntegerOption(option =>
            option
                .setName("limit")
                .setDescription("Maximum number of AFK users to show (default: 20)")
                .setMinValue(1)
                .setMaxValue(50)
                .setRequired(false)
        ),

    async execute(interaction, config, client) {
        await interaction.deferReply();

        const limit = interaction.options.getInteger("limit") || 20;
        const guildId = interaction.guildId;

        try {
            // Get all members in the guild
            const members = await interaction.guild.members.fetch();
            const afkUsers = [];

            // Check each member for AFK status
            for (const [userId, member] of members) {
                const afkData = await getAFKStatus(client, guildId, userId);
                if (afkData) {
                    afkUsers.push({
                        member,
                        ...afkData
                    });
                }
            }

            // Sort by timestamp (most recent first)
            afkUsers.sort((a, b) => b.timestamp - a.timestamp);

            if (afkUsers.length === 0) {
                return interaction.editReply({
                    embeds: [createEmbed(
                        "🌙 AFK Users",
                        "No one is currently AFK in this server."
                    ).setColor("#3498DB")]
                });
            }

            // Create embed with AFK users
            const embed = createEmbed(
                "🌙 AFK Users",
                `Found **${afkUsers.length}** user(s) currently AFK in this server.`
            ).setColor("#9B59B6");

            // Limit the results
            const displayUsers = afkUsers.slice(0, limit);
            const moreUsers = afkUsers.length > limit ? afkUsers.length - limit : 0;

            // Add each AFK user to the embed
            displayUsers.forEach((afkUser, index) => {
                const timeAgo = getTimeAgo(afkUser.timestamp);
                const displayName = afkUser.member.nickname || afkUser.member.user.username;
                
                embed.addFields({
                    name: `${index + 1}. ${displayName}`,
                    value: `👤 **User:** <@${afkUser.userId}>\n💭 **Reason:** ${afkUser.reason}\n⏰ **AFK Since:** ${timeAgo}`,
                    inline: false
                });
            });

            // Add footer with additional info
            embed.setFooter({
                text: moreUsers > 0 
                    ? `Showing ${displayUsers.length} of ${afkUsers.length} AFK users (${moreUsers} more not shown)`
                    : `Showing all ${afkUsers.length} AFK users`
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error("AFK list command error:", error);
            await interaction.editReply({
                embeds: [errorEmbed("An error occurred while fetching AFK users.")]
            });
        }
    }
};

/**
 * Get a human-readable time ago string
 * @param {number} timestamp - The timestamp in milliseconds
 * @returns {string} Time ago string
 */
function getTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (days > 0) {
        return `${days} day${days > 1 ? 's' : ''} ago`;
    } else if (hours > 0) {
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else if (minutes > 0) {
        return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else {
        return 'Just now';
    }
}
