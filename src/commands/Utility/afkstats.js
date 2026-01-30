import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { getAFKStatus } from '../../utils/afk.js';

export default {
    data: new SlashCommandBuilder()
        .setName("afkstats")
        .setDescription("View AFK statistics for this server")
        .addStringOption(option =>
            option
                .setName("type")
                .setDescription("Type of statistics to view")
                .setRequired(false)
                .addChoices(
                    { name: "Overview", value: "overview" },
                    { name: "Top Reasons", value: "reasons" },
                    { name: "Recent Activity", value: "recent" }
                )
        ),
    category: "utility",

    async execute(interaction, config, client) {
        await interaction.deferReply();

        const type = interaction.options.getString("type") || "overview";
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

            if (afkUsers.length === 0) {
                return interaction.editReply({
                    embeds: [createEmbed(
                        "📊 AFK Statistics",
                        "No AFK data available for this server."
                    ).setColor("#3498DB")]
                });
            }

            switch (type) {
                case "overview":
                    await showOverview(interaction, afkUsers);
                    break;
                case "reasons":
                    await showTopReasons(interaction, afkUsers);
                    break;
                case "recent":
                    await showRecentActivity(interaction, afkUsers);
                    break;
            }

        } catch (error) {
            console.error("AFK stats command error:", error);
            await interaction.editReply({
                embeds: [errorEmbed("An error occurred while fetching AFK statistics.")]
            });
        }
    }
};

async function showOverview(interaction, afkUsers) {
    const totalAFK = afkUsers.length;
    const totalMembers = interaction.guild.memberCount;
    const afkPercentage = ((totalAFK / totalMembers) * 100).toFixed(1);

    // Calculate average AFK time
    const now = Date.now();
    const totalAfkTime = afkUsers.reduce((sum, user) => sum + (now - user.timestamp), 0);
    const avgAfkTime = Math.floor(totalAfkTime / totalAFK);
    
    const embed = createEmbed(
        "📊 AFK Statistics - Overview",
        `Current AFK status for **${interaction.guild.name}**`
    ).setColor("#3498DB");

    embed.addFields(
        {
            name: "👥 Total Members",
            value: `${totalMembers.toLocaleString()}`,
            inline: true
        },
        {
            name: "🌙 Currently AFK",
            value: `${totalAFK} (${afkPercentage}%)`,
            inline: true
        },
        {
            name: "⏱️ Average AFK Duration",
            value: getTimeAgo(now - avgAfkTime),
            inline: true
        }
    );

    // Add longest AFK user
    const longestAFK = afkUsers.reduce((prev, current) => 
        (prev.timestamp < current.timestamp) ? prev : current
    );
    
    embed.addFields({
        name: "🏆 Longest AFK",
        value: `<@${longestAFK.userId}> - ${getTimeAgo(longestAFK.timestamp)}`,
        inline: false
    });

    embed.setFooter({
        text: "Use /afkstats with different types for more detailed information"
    });

    await interaction.editReply({ embeds: [embed] });
}

async function showTopReasons(interaction, afkUsers) {
    // Count reasons
    const reasonCounts = {};
    afkUsers.forEach(user => {
        const reason = user.reason.toLowerCase();
        reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    });

    // Sort by count
    const sortedReasons = Object.entries(reasonCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);

    const embed = createEmbed(
        "📊 AFK Statistics - Top Reasons",
        "Most common AFK reasons in this server"
    ).setColor("#9B59B6");

    if (sortedReasons.length === 0) {
        embed.setDescription("No AFK reasons found.");
    } else {
        sortedReasons.forEach(([reason, count], index) => {
            embed.addFields({
                name: `${index + 1}. ${reason.charAt(0).toUpperCase() + reason.slice(1)}`,
                value: `${count} user${count > 1 ? 's' : ''}`,
                inline: true
            });
        });
    }

    embed.setFooter({
        text: `Showing top ${sortedReasons.length} of ${Object.keys(reasonCounts).length} unique reasons`
    });

    await interaction.editReply({ embeds: [embed] });
}

async function showRecentActivity(interaction, afkUsers) {
    // Sort by timestamp (most recent first)
    const recentAFK = afkUsers
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 15);

    const embed = createEmbed(
        "📊 AFK Statistics - Recent Activity",
        "Most recent AFK status changes"
    ).setColor("#E67E22");

    recentAFK.forEach((user, index) => {
        const displayName = user.member.nickname || user.member.user.username;
        embed.addFields({
            name: `${index + 1}. ${displayName}`,
            value: `💭 **Reason:** ${user.reason}\n⏰ **Set:** ${getTimeAgo(user.timestamp)}`,
            inline: false
        });
    });

    embed.setFooter({
        text: `Showing ${recentAFK.length} most recent AFK users`
    });

    await interaction.editReply({ embeds: [embed] });
}

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
