import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getEconomyKey } from '../../services/database.js';
import { botConfig } from '../../config/bot.js';

export default {
    data: new SlashCommandBuilder()
        .setName("eleaderboard")
        .setDescription("View the server's top 10 richest users.")
        .addStringOption((option) =>
            option
                .setName("sort_by")
                .setDescription("The metric to sort the leaderboard by.")
                .addChoices(
                    { name: "Net Worth (Cash + Bank)", value: "net_worth" },
                    { name: "Cash", value: "cash" },
                    { name: "Bank", value: "bank" },
                )
                .setRequired(false),
        )
        .setDMPermission(false),
    
    
    async execute(interaction, config, client) {
const guildId = interaction.guildId;
        const sortBy = interaction.options.getString("sort_by") || "net_worth";

        try {
            const prefix = `guild:${guildId}:economy:`;

            let allKeys = await client.db.list(prefix);

            if (!Array.isArray(allKeys)) {
                allKeys = [];
            }

            if (allKeys.length === 0) {
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Leaderboard Empty",
                            "No economy data found for this server.",
                        ),
                    ],
                });
            }

            let allUserData = [];

            for (const key of allKeys) {
                const userId = key.replace(prefix, "");
                const userData = await client.db.get(key);

                if (userData) {
                    allUserData.push({
                        userId: userId,
                        cash: userData.wallet || 0,
                        bank: userData.bank || 0,
                        net_worth: (userData.wallet || 0) + (userData.bank || 0),
                    });
                }
            }

            allUserData.sort((a, b) => {
                if (sortBy === "net_worth") return b.net_worth - a.net_worth;
                if (sortBy === "cash") return b.cash - a.cash;
                if (sortBy === "bank") return b.bank - a.bank;
return b.net_worth - a.net_worth;
            });

            const topUsers = allUserData.slice(0, 10);
            const userRank =
                allUserData.findIndex((u) => u.userId === interaction.user.id) +
                1;
            const rankEmoji = ["🥇", "🥈", "🥉"];
            const leaderboardEntries = [];

            for (let i = 0; i < topUsers.length; i++) {
                const user = topUsers[i];
                const member = await interaction.guild.members
                    .fetch(user.userId)
                    .catch(() => null);
                const username = member
                    ? member.user.username
                    : `Unknown User (${user.userId})`;
                const rank = i + 1;
                const emoji = rankEmoji[i] || `**#${rank}**`;
                const value =
                    sortBy === "net_worth"
                        ? user.net_worth
                        : sortBy === "cash"
                          ? user.cash
                          : user.bank;

                leaderboardEntries.push(
                    `${emoji} **${username}** - $${value.toLocaleString()}`,
                );
            }

            const fieldNameMap = {
                net_worth: "Net Worth (Cash + Bank)",
                cash: "Cash Balance",
                bank: "Bank Balance",
            };

            const embed = createEmbed(
                `👑 Economy Leaderboard (${fieldNameMap[sortBy]})`,
                leaderboardEntries.join("\n"),
            ).setFooter({
                text: `Your Rank: ${userRank > 0 ? userRank : "Not Ranked"} | Data sorted by ${fieldNameMap[sortBy]}`,
            });

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error("Leaderboard command error:", error);
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "System Error",
                        "Could not generate the leaderboard.",
                    ),
                ],
            });
        }
    },
};

