import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { NexoBotError, ErrorTypes } from '../../../utils/errorHandler.js';
import { checkUserPermissions } from '../../../utils/permissionGuard.js';
import { removeLevels, getUserLevelData, getLevelingConfig } from '../../../services/leveling/leveling.js';
import { createEmbed } from '../../../utils/embeds.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import type { Command } from '../../../types/index.js';
export default {
  data: new SlashCommandBuilder()
    .setName('levelremove')
    .setDescription('Einem Nutzer Level abziehen')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Der Nutzer, dem Level abgezogen werden')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('levels')
        .setDescription('Anzahl der Level, die abgezogen werden')
        .setRequired(true)
        .setMinValue(1)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
  category: 'Leveling',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    const hasPermission = await checkUserPermissions(
      interaction,
      PermissionFlagsBits.ManageGuild,
      'Du brauchst die Berechtigung „Server verwalten“, um diesen Command zu nutzen.'
    );
    if (!hasPermission) return;

    const levelingConfig = await getLevelingConfig(client, interaction.guildId!);
    if (!levelingConfig?.enabled) {
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor('#f1c40f')
            .setDescription('Das Leveling-System ist auf diesem Server derzeit deaktiviert.')
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const targetUser = interaction.options.getUser('user')!;
    const levelsToRemove = interaction.options.getInteger('levels')!;

    const member = await interaction.guild!.members.fetch(targetUser.id).catch(() => null);
    if (!member) {
      throw new NexoBotError(
        `User ${targetUser.id} not found in this guild`,
        ErrorTypes.USER_INPUT,
        'Der angegebene Nutzer ist nicht auf diesem Server.'
      );
    }

    const userData = await getUserLevelData(client, interaction.guildId!, targetUser.id);
    if (userData.level === 0) {
      throw new NexoBotError(
        `User ${targetUser.id} is already at minimum level`,
        ErrorTypes.VALIDATION,
        `${targetUser.tag} ist bereits auf Level 0, es können keine Level abgezogen werden.`
      );
    }

    const updatedData = await removeLevels(client, interaction.guildId!, targetUser.id, levelsToRemove);

    await InteractionHelper.safeEditReply(interaction, {
      embeds: [
        createEmbed({
          title: 'Level abgezogen',
          description: `${targetUser.tag} wurden ${levelsToRemove} Level abgezogen.\n**Neues Level:** ${updatedData.level}`,
          color: 'success'
        })
      ]
    });

    logger.info(
      `[ADMIN] User ${interaction.user.tag} removed ${levelsToRemove} levels from ${targetUser.tag} in guild ${interaction.guildId}`
    );
  }
} satisfies Command;