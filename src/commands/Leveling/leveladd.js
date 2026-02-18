




import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { checkUserPermissions } from '../../utils/permissionGuard.js';
import { addLevels } from '../../services/leveling.js';
import { createEmbed } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('leveladd')
    .setDescription('Add levels to a user')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user to add levels to')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('levels')
        .setDescription('Number of levels to add')
        .setRequired(true)
        .setMinValue(1)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
  category: 'Leveling',

  





  async execute(interaction, config, client) {
    try {
      await interaction.deferReply();

      
      const hasPermission = await checkUserPermissions(
        interaction,
        PermissionFlagsBits.ManageGuild,
        'You need ManageGuild permission to use this command.'
      );
      if (!hasPermission) return;

      const targetUser = interaction.options.getUser('user');
      const levelsToAdd = interaction.options.getInteger('levels');

      
      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!member) {
        throw new TitanBotError(
          `User ${targetUser.id} not found in this guild`,
          ErrorTypes.USER_INPUT,
          'The specified user is not in this server.'
        );
      }

      
      const userData = await addLevels(client, interaction.guildId, targetUser.id, levelsToAdd);

      await interaction.editReply({
        embeds: [
          createEmbed({
            title: '✅ Levels Added',
            description: `Successfully added ${levelsToAdd} levels to ${targetUser.tag}.\n**New Level:** ${userData.level}`,
            color: 'success'
          })
        ]
      });

      logger.info(
        `[ADMIN] User ${interaction.user.tag} added ${levelsToAdd} levels to ${targetUser.tag} in guild ${interaction.guildId}`
      );
    } catch (error) {
      logger.error('LevelAdd command error:', error);
      await handleInteractionError(interaction, error, {
        type: 'command',
        commandName: 'leveladd'
      });
    }
  }
};


