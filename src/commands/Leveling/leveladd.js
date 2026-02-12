import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getUserLevelData, saveUserLevelData, getXpForLevel } from '../../utils/database.js';
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
        try {
            const targetUser = interaction.options.getUser("user");
                const levelsToAdd = interaction.options.getInteger("levels");
                
                const userData = await getUserLevelData(
                    client,
                    interaction.guildId,
                    targetUser.id,
                );

                const newLevel = userData.level + levelsToAdd;
                const newXp = 0;
                const newTotalXp =
                    userData.totalXp +
                    (getXpForLevel(newLevel) - getXpForLevel(userData.level));

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
                        successEmbed("Levels Added", `Successfully added ${levelsToAdd} levels to ${targetUser.tag}.`),
                    ],
                },
                errorEmbed("Level Add Failed", "Could not add levels to that user.")
            );
        } catch (error) {
            console.error('LevelAdd command error:', error);
            return interaction.reply({
                embeds: [errorEmbed('System Error', 'Could not add levels at this time.')],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};

