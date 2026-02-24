




import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { checkUserPermissions } from '../../utils/permissionGuard.js';
import { addLevels, getLevelingConfig } from '../../services/leveling.js';
import { createEmbed } from '../../utils/embeds.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
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
      await InteractionHelper.safeDefer(interaction);

      
      const hasPermission = await checkUserPermissions(
        interaction,
        PermissionFlagsBits.ManageGuild,
        'You need ManageGuild permission to use this command.'
      );
      if (!hasPermission) return;

      const levelingConfig = await getLevelingConfig(client, interaction.guildId);
      if (!levelingConfig?.enabled) {
        await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            new EmbedBuilder()
              .setColor('#f1c40f')
              .setDescription('The leveling system is currently disabled on this server.')
          ],
          flags: MessageFlags.Ephemeral
        });
        return;
      }

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

      await InteractionHelper.safeEditReply(interaction, {
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


