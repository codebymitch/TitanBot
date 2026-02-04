import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getUserLevelData, saveUserLevelData, getXpForLevel } from '../../utils/database.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

// Migrated from: commands/Leveling/levelset.js
export default {
    data: new SlashCommandBuilder()
        .setName("levelset")
        .setDescription("Set a user's level")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("The user to set the level for")
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName("level")
                .setDescription("The level to set")
                .setRequired(true)
                .setMinValue(0)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false),
    category: "Leveling",
    
    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: ["Ephemeral"] });
        if (!deferSuccess) return;
        
        try {
            const targetUser = interaction.options.getUser("user");
            const newLevel = interaction.options.getInteger("level");
            const userData = await getUserLevelData(client, interaction.guildId, targetUser.id);
            
            // Calculate new XP and total XP
            const newXp = 0; // Reset XP to 0 for the new level
            const newTotalXp = getXpForLevel(newLevel) + newXp;
            
            // Update user data
            userData.level = newLevel;
            userData.xp = newXp;
            userData.totalXp = newTotalXp;
            
            await saveUserLevelData(client, interaction.guildId, targetUser.id, userData);
            
            await interaction.editReply({
                embeds: [createEmbed({ title: "Level Set", description: `Successfully set ${targetUser.tag}'s level to ${newLevel}.` })]
            });
            
        } catch (error) {
            console.error("LevelSet command error:", error);
            await interaction.editReply({
                embeds: [createEmbed({ title: "Error", description: "An error occurred while setting the user's level." })]
            });
        }
    }
};
