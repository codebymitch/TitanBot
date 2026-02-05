import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getUserLevelData, saveUserLevelData, getXpForLevel } from '../../utils/database.js';

// Migrated from: commands/Leveling/levelremove.js
export default {
    data: new SlashCommandBuilder()
        .setName("levelremove")
        .setDescription("Remove levels from a user")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("The user to remove levels from")
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName("levels")
                .setDescription("Number of levels to remove")
                .setRequired(true)
                .setMinValue(1)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false),
    category: "Leveling",
    
    async execute(interaction, config, client) {
try {
            const targetUser = interaction.options.getUser("user");
            const levelsToRemove = interaction.options.getInteger("levels");
            const userData = await getUserLevelData(client, interaction.guildId, targetUser.id);
            
            // Calculate new level (can't go below 0)
            const newLevel = Math.max(0, userData.level - levelsToRemove);
            
            // If we're already at level 0, don't make any changes
            if (userData.level === 0) {
                return interaction.reply({
                    embeds: [createEmbed({ title: "Level Remove", description: `${targetUser.tag} is already at level 0.` })]
                });
            }
            
            // Calculate new XP and total XP
            const newXp = 0; // Reset XP to 0 for the new level
            const newTotalXp = getXpForLevel(newLevel) + newXp;
            
            // Update user data
            userData.level = newLevel;
            userData.xp = newXp;
            userData.totalXp = newTotalXp;
            
            await saveUserLevelData(client, interaction.guildId, targetUser.id, userData);
            
            await interaction.editReply({
                embeds: [createEmbed({ title: "Levels Removed", description: `Successfully removed ${levelsToRemove} levels from ${targetUser.tag}. They are now level ${newLevel}.` })]
            });
            
        } catch (error) {
            console.error("LevelRemove command error:", error);
            await interaction.editReply({
                embeds: [createEmbed({ title: "Error", description: "An error occurred while removing levels from the user." })]
            });
        }
    }
};
