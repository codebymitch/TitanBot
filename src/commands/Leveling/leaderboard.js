import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Leveling/leaderboard.js
export default {
    data: new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription("Shows the server's level leaderboard")
        .setDMPermission(false),
    category: "Leveling",

    async execute(interaction, config, client) {
        await interaction.deferReply();

        try {
            const leaderboard = await getLeaderboard(
                client,
                interaction.guildId,
                10,
            );
            const levelingConfig = await getLevelingConfig(
                client,
                interaction.guildId,
            );

            if (!levelingConfig?.enabled) {
                return interaction.editReply({
                    embeds: [
                        createEmbed(
                            "Leveling Disabled",
                            "The leveling system is currently disabled on this server.",
                        ),
                    ],
                });
            }

            if (leaderboard.length === 0) {
                return interaction.editReply({
                    embeds: [
                        createEmbed(
                            "Leaderboard",
                            "No level data found for this server yet. Start chatting to gain XP!",
                        ),
                    ],
                });
            }

            const embed = new EmbedBuilder()
                .setTitle("🏆 Level Leaderboard")
                .setColor("#3498db")
                .setDescription("Top 10 most active members in this server:")
                .setTimestamp();

            const leaderboardText = await Promise.all(
                leaderboard.map(async (user, index) => {
                    try {
                        const member = await interaction.guild.members
                            .fetch(user.userId)
                            .catch(() => null);
                        const username =
                            member?.user?.tag ||
                            `Unknown User (${user.userId})`;
                        const xpForNextLevel = getXpForLevel(user.level + 1);

                        // Add medal emoji for top 3
                        let rankPrefix = `${index + 1}.`;
                        if (index === 0) rankPrefix = "🥇";
                        else if (index === 1) rankPrefix = "🥈";
                        else if (index === 2) rankPrefix = "🥉";
                        else rankPrefix = `**${index + 1}.**`;

                        return `${rankPrefix} ${username} - Level ${user.level} (${user.xp}/${xpForNextLevel} XP)`;
                    } catch (error) {
                        console.error(
                            `Error processing user ${user.userId}:`,
                            error,
                        );
                        return `**${index + 1}.** Error loading user ${user.userId}`;
                    }
                }),
            );

            embed.addFields({
                name: "Rankings",
                value: leaderboardText.join("\n"),
            });

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error("Leaderboard command error:", error);
            await interaction.editReply({
                embeds: [
                    createEmbed(
                        "Error",
                        "An error occurred while fetching the leaderboard. Please try again later.",
                    ),
                ],
            });
        }
    },
};
