/**
 * Level Config Command
 * Configure the leveling system for the guild (admin only)
 */

import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { checkUserPermissions, botHasPermission } from '../../utils/permissionGuard.js';
import { getLevelingConfig, saveLevelingConfig } from '../../services/leveling.js';
import { createEmbed } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('levelconfig')
    .setDescription('Configure the leveling system')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('toggle')
        .setDescription('Enable or disable the leveling system')
        .addBooleanOption((option) =>
          option
            .setName('enabled')
            .setDescription('Whether to enable or disable the leveling system')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('channel')
        .setDescription('Set the level up notification channel')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('The channel to send level up notifications to')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('xp')
        .setDescription('Set the XP range per message')
        .addIntegerOption((option) =>
          option
            .setName('min')
            .setDescription('Minimum XP per message')
            .setRequired(true)
            .setMinValue(1)
        )
        .addIntegerOption((option) =>
          option
            .setName('max')
            .setDescription('Maximum XP per message')
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('message')
        .setDescription('Set the level up message')
        .addStringOption((option) =>
          option
            .setName('text')
            .setDescription('Use {user} for the username and {level} for the level')
            .setRequired(true)
        )
    )
    .setDMPermission(false),
  category: 'Leveling',

  /**
   * Execute levelconfig command
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

      const subcommand = interaction.options.getSubcommand();
      const levelingConfig = await getLevelingConfig(client, interaction.guildId);

      switch (subcommand) {
        case 'toggle': {
          const enabled = interaction.options.getBoolean('enabled');
          levelingConfig.enabled = enabled;

          await saveLevelingConfig(client, interaction.guildId, levelingConfig);

          await interaction.editReply({
            embeds: [
              createEmbed({
                title: '✅ Leveling System Updated',
                description: `The leveling system has been **${enabled ? 'enabled' : 'disabled'}**.`,
                color: 'success'
              })
            ]
          });

          logger.info(`Leveling system ${enabled ? 'enabled' : 'disabled'} in guild ${interaction.guildId}`);
          break;
        }

        case 'channel': {
          const channel = interaction.options.getChannel('channel');

          // Verify bot can send messages in the channel
          if (!botHasPermission(channel, ['SendMessages', 'EmbedLinks'])) {
            throw new TitanBotError(
              'Bot missing permissions in the specified channel',
              ErrorTypes.PERMISSION,
              'I need SendMessages and EmbedLinks permissions in that channel.'
            );
          }

          levelingConfig.levelUpChannel = channel.id;

          await saveLevelingConfig(client, interaction.guildId, levelingConfig);

          await interaction.editReply({
            embeds: [
              createEmbed({
                title: '✅ Level Up Channel Set',
                description: `Level up notifications will now be sent in ${channel}.`,
                color: 'success'
              })
            ]
          });

          logger.info(`Level up channel set to ${channel.id} in guild ${interaction.guildId}`);
          break;
        }

        case 'xp': {
          const min = interaction.options.getInteger('min');
          const max = interaction.options.getInteger('max');

          if (min > max) {
            throw new TitanBotError(
              'Invalid XP range configuration',
              ErrorTypes.VALIDATION,
              'The minimum XP cannot be greater than the maximum XP.'
            );
          }

          levelingConfig.xpRange = { min, max };
          await saveLevelingConfig(client, interaction.guildId, levelingConfig);

          await interaction.editReply({
            embeds: [
              createEmbed({
                title: '✅ XP Range Updated',
                description: `XP per message is now between **${min}** and **${max}**.`,
                color: 'success'
              })
            ]
          });

          logger.info(`XP range set to ${min}-${max} in guild ${interaction.guildId}`);
          break;
        }

        case 'message': {
          const text = interaction.options.getString('text');

          // Validate message template
          if (!text.includes('{user}') && !text.includes('{level}')) {
            logger.warn(`Message template missing placeholders in guild ${interaction.guildId}`);
          }

          levelingConfig.levelUpMessage = text;

          await saveLevelingConfig(client, interaction.guildId, levelingConfig);

          await interaction.editReply({
            embeds: [
              createEmbed({
                title: '✅ Level Up Message Updated',
                description: `The level up message has been updated.\n\n**Preview:** ${text.replace('{user}', '@user').replace('{level}', '5')}`,
                color: 'success'
              })
            ]
          });

          logger.info(`Level up message updated in guild ${interaction.guildId}`);
          break;
        }
      }
    } catch (error) {
      logger.error('LevelConfig command error:', error);
      await handleInteractionError(interaction, error, {
        type: 'command',
        commandName: 'levelconfig'
      });
    }
  }
};


