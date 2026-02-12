import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getUserLevelData, saveUserLevelData, getXpForLevel } from '../../utils/database.js';
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
try {
            const targetUser = interaction.options.getUser("user");
            const newLevel = interaction.options.getInteger("level");
            const userData = await getUserLevelData(client, interaction.guildId, targetUser.id);
            
const newXp = 0;
            const newTotalXp = getXpForLevel(newLevel) + newXp;
            
            userData.level = newLevel;
            userData.xp = newXp;
            userData.totalXp = newTotalXp;
            
            await saveUserLevelData(client, interaction.guildId, targetUser.id, userData);
            
            await interaction.reply({
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

