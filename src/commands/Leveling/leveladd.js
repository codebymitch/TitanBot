import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getUserLevelData, saveUserLevelData, getXpForLevel } from '../../utils/database.js';

// Migrated from: commands/Leveling/leveladd.js
export default {
    data: new SlashCommandBuilder()
        .setName("leveladd")
        .setDescription("Add levels to a user")
        .addUserOption((option) =>
            option
                .setName("user")
                .setDescription("The user to add levels to")
                .setRequired(true),
        )
        .addIntegerOption((option) =>
            option
                .setName("levels")
                .setDescription("Number of levels to add")
                .setRequired(true)
                .setMinValue(1),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false),
    category: "Leveling",

    async execute(interaction, config, client) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const targetUser = interaction.options.getUser("user");
            const levelsToAdd = interaction.options.getInteger("levels");
            const userData = await getUserLevelData(
                client,
                interaction.guildId,
                targetUser.id,
            );

            // Calculate new level and XP
            const newLevel = userData.level + levelsToAdd;
            const newXp = 0; // Reset XP to 0 for the new level
            const newTotalXp =
                userData.totalXp +
                (getXpForLevel(newLevel) - getXpForLevel(userData.level));

            // Update user data
            userData.level = newLevel;
            userData.xp = newXp;
            userData.totalXp = newTotalXp;

            await saveUserLevelData(
                client,
                interaction.guildId,
                targetUser.id,
                userData,
            );

            await interaction.editReply({
                embeds: [
                    createEmbed({ title: "Levels Added", description: `Successfully added ${levelsToAdd} levels to ${targetUser.tag}.`, }),
                ],
            });
        } catch (error) {
            console.error("LevelAdd command error:", error);
            await interaction.editReply({
                embeds: [
                    createEmbed({ title: "Error", description: "An error occurred while adding levels to the user.", }),
                ],
            });
        }
    },
};
