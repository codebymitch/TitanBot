import { getColor } from '../../config/bot.js';
﻿import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getLeaderboard, getLevelingConfig, getXpForLevel } from '../../utils/database.js';
export default {
    data: new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription("Shows the server's level leaderboard")
        .setDMPermission(false),
    category: "Leveling",

    async execute(interaction, config, client) {
        const leaderboard = await getLeaderboard(client, interaction.guildId, 10);
                const levelingConfig = await getLevelingConfig(client, interaction.guildId);

                if (!levelingConfig?.enabled) {
                    throw new Error("The leveling system is currently disabled on this server.");
                }

                if (leaderboard.length === 0) {
                    throw new Error("No level data found yet. Start chatting to gain XP!");
                }

                const embed = new EmbedBuilder()
                    .setTitle("🏆 Level Leaderboard")
                    .setColor(getColor('info'))
                    .setDescription("Top 10 most active members in this server:")
                    .setTimestamp();

                const leaderboardText = await Promise.all(
                    leaderboard.map(async (user, index) => {
                        try {
                            const member = await interaction.guild.members.fetch(user.userId).catch(() => null);
                            const username = member?.user?.tag || `Unknown User (${user.userId})`;
                            const xpForNextLevel = getXpForLevel(user.level + 1);

                            let rankPrefix = `${index + 1}.`;
                            if (index === 0) rankPrefix = "🥇";
                            else if (index === 1) rankPrefix = "🥈";
                            else if (index === 2) rankPrefix = "🥉";
                            else rankPrefix = `**${index + 1}.**`;

                            return `${rankPrefix} ${username} - Level ${user.level} (${user.xp}/${xpForNextLevel} XP)`;
                        } catch (error) {
                            return `**${index + 1}.** Error loading user ${user.userId}`;
                        }
                    }),
                );

                embed.addFields({
                    name: "Rankings",
                    value: leaderboardText.join("\n"),
                });

                await interaction.editReply({ embeds: [embed] });
    },
};



