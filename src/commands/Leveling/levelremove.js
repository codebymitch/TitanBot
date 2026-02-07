import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getUserLevelData, saveUserLevelData, getXpForLevel } from '../../utils/database.js';

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
            
            const newLevel = Math.max(0, userData.level - levelsToRemove);
            
            if (userData.level === 0) {
                return interaction.reply({
                    embeds: [createEmbed({ title: "Level Remove", description: `${targetUser.tag} is already at level 0.` })]
                });
            }
            
const newXp = 0;
            const newTotalXp = getXpForLevel(newLevel) + newXp;
            
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
