/**
 * Level Remove Command
 * Removes levels from a user (admin only)
 */

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { checkUserPermissions } from '../../utils/permissionGuard.js';
import { removeLevels, getUserLevelData } from '../../services/leveling.js';
import { createEmbed } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('levelremove')
    .setDescription('Remove levels from a user')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user to remove levels from')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('levels')
        .setDescription('Number of levels to remove')
        .setRequired(true)
        .setMinValue(1)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
  category: 'Leveling',

  /**
   * Execute levelremove command
   * @param {ChatInputCommandInteraction} interaction - Command interaction
   * @param {Object} config - Guild configuration
   * @param {Client} client - Discord client
   */
  async execute(interaction, config, client) {
    try {
      await interaction.deferReply();

      // Check permissions
      const hasPermission = await checkUserPermissions(
        interaction,
        PermissionFlagsBits.ManageGuild,
        'You need ManageGuild permission to use this command.'
      );
      if (!hasPermission) return;

      const targetUser = interaction.options.getUser('user');
      const levelsToRemove = interaction.options.getInteger('levels');

      // Validate user exists in guild
      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!member) {
        throw new TitanBotError(
          `User ${targetUser.id} not found in this guild`,
          ErrorTypes.USER_INPUT,
          'The specified user is not in this server.'
        );
      }

      // Check if user has levels to remove
      const userData = await getUserLevelData(client, interaction.guildId, targetUser.id);
      if (userData.level === 0) {
        throw new TitanBotError(
          `User ${targetUser.id} is already at minimum level`,
          ErrorTypes.VALIDATION,
          `${targetUser.tag} is already at level 0 and cannot have levels removed.`
        );
      }

      // Use service to remove levels
      const updatedData = await removeLevels(client, interaction.guildId, targetUser.id, levelsToRemove);

      await interaction.editReply({
        embeds: [
          createEmbed({
            title: '✅ Levels Removed',
            description: `Successfully removed ${levelsToRemove} levels from ${targetUser.tag}.\n**New Level:** ${updatedData.level}`,
            color: 'success'
          })
        ]
      });

      logger.info(
        `[ADMIN] User ${interaction.user.tag} removed ${levelsToRemove} levels from ${targetUser.tag} in guild ${interaction.guildId}`
      );
    } catch (error) {
      logger.error('LevelRemove command error:', error);
      await handleInteractionError(interaction, error, {
        type: 'command',
        commandName: 'levelremove'
      });
    }
  }
};


