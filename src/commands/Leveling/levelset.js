/**
 * Level Set Command
 * Sets a user's level to a specific value (admin only)
 */

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { checkUserPermissions } from '../../utils/permissionGuard.js';
import { setUserLevel } from '../../services/leveling.js';
import { createEmbed } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('levelset')
    .setDescription("Set a user's level to a specific value")
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user to set the level for')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('level')
        .setDescription('The level to set')
        .setRequired(true)
        .setMinValue(0)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
  category: 'Leveling',

  /**
   * Execute levelset command
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
      const newLevel = interaction.options.getInteger('level');

      // Validate user exists in guild
      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!member) {
        throw new TitanBotError(
          `User ${targetUser.id} not found in this guild`,
          ErrorTypes.USER_INPUT,
          'The specified user is not in this server.'
        );
      }

      // Use service to set level (includes validation)
      const userData = await setUserLevel(client, interaction.guildId, targetUser.id, newLevel);

      await interaction.editReply({
        embeds: [
          createEmbed({
            title: '✅ Level Set',
            description: `Successfully set ${targetUser.tag}'s level to **${newLevel}**.\n**Total XP:** ${userData.totalXp}`,
            color: 'success'
          })
        ]
      });

      logger.info(
        `[ADMIN] User ${interaction.user.tag} set ${targetUser.tag}'s level to ${newLevel} in guild ${interaction.guildId}`
      );
    } catch (error) {
      logger.error('LevelSet command error:', error);
      await handleInteractionError(interaction, error, {
        type: 'command',
        commandName: 'levelset'
      });
    }
  }
};


