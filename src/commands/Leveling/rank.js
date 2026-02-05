import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getUserLevelData, getLevelingConfig, getXpForLevel } from '../../utils/database.js';
// Migrated from: commands/Leveling/rank.js
export default {
    data: new SlashCommandBuilder()
        .setName("rank")
        .setDescription("Check your or another user's rank and level")
        .addUserOption((option) =>
            option
                .setName("user")
                .setDescription("The user to check the rank of")
                .setRequired(false),
        )
        .setDMPermission(false),
    category: "Leveling",

    async execute(interaction, config, client) {
        const targetUser = interaction.options.getUser("user") || interaction.user;
                const member = await interaction.guild.members
                    .fetch(targetUser.id)
                    .catch(() => null);

                if (!member) {
                    throw new Error("Could not find the specified user in this server.");
                }

                const [userData, levelingConfig] = await Promise.all([
                    getUserLevelData(client, interaction.guildId, targetUser.id),
                    getLevelingConfig(client, interaction.guildId),
                ]);

                if (!levelingConfig?.enabled) {
                    throw new Error("The leveling system is currently disabled on this server.");
                }

                const safeUserData = {
                    level: userData?.level ?? 0,
                    xp: userData?.xp ?? 0,
                    totalXp: userData?.totalXp ?? 0,
                };

                const xpNeeded = getXpForLevel(safeUserData.level + 1);
                const progress = xpNeeded > 0 ? Math.floor((safeUserData.xp / xpNeeded) * 100) : 0;
                const progressBar = createProgressBar(progress, 20);

                const embed = new EmbedBuilder()
                    .setTitle(`${member.displayName}'s Rank`)
                    .setThumbnail(member.displayAvatarURL({ dynamic: true }))
                    .addFields(
                        {
                            name: "Level",
                            value: safeUserData.level.toString(),
                            inline: true,
                        },
                        {
                            name: "XP",
                            value: `${safeUserData.xp}/${xpNeeded}`,
                            inline: true,
                        },
                        {
                            name: "Total XP",
                            value: safeUserData.totalXp.toString(),
                            inline: true,
                        },
                        {
                            name: `Progress to Level ${safeUserData.level + 1}`,
                            value: `${progressBar} ${progress}%`,
                        },
                    )
                    .setColor("#3498db")
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed]
            },
            errorEmbed("Rank Error", "Could not fetch rank information. Try again later.")
        );
    },
};

function createProgressBar(percentage, length = 10) {
    const filled = Math.round((percentage / 100) * length);
    return "█".repeat(filled) + "░".repeat(length - filled);
}
