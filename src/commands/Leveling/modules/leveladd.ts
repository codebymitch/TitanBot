import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { NexoBotError, ErrorTypes } from '../../../utils/errorHandler.js';
import { checkUserPermissions } from '../../../utils/permissionGuard.js';
import { addLevels, getLevelingConfig } from '../../../services/leveling/leveling.js';
import { createEmbed } from '../../../utils/embeds.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import type { Command } from '../../../types/index.js';
export default {
  data: new SlashCommandBuilder()
    .setName('leveladd')
    .setDescription('Einem Nutzer Level hinzufügen')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Der Nutzer, der Level erhalten soll')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('levels')
        .setDescription('Anzahl der Level, die hinzugefügt werden')
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
    const levelsToAdd = interaction.options.getInteger('levels')!;

    const member = await interaction.guild!.members.fetch(targetUser.id).catch(() => null);
    if (!member) {
      throw new NexoBotError(
        `User ${targetUser.id} not found in this guild`,
        ErrorTypes.USER_INPUT,
        'Der angegebene Nutzer ist nicht auf diesem Server.'
      );
    }

    const userData = await addLevels(client, interaction.guildId!, targetUser.id, levelsToAdd);

    await InteractionHelper.safeEditReply(interaction, {
      embeds: [
        createEmbed({
          title: 'Level hinzugefügt',
          description: `${targetUser.tag} hat ${levelsToAdd} Level erhalten.\n**Neues Level:** ${userData.level}`,
          color: 'success'
        })
      ]
    });

    logger.info(
      `[ADMIN] User ${interaction.user.tag} added ${levelsToAdd} levels to ${targetUser.tag} in guild ${interaction.guildId}`
    );
  }
} satisfies Command;