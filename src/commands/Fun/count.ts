import type { Command } from '../../types/index.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
  getCountingGameConfig,
  activateCountingGame,
  disableCountingGame,
  resetCountingGame,
  buildCountingLeaderboard,
  getCountingSystemChoices,
  getCountingSystemLabel,
  getExpectedCountValue,
} from '../../services/countingGameService.js';
import { logger } from '../../utils/logger.js';

import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
export default {
  data: new SlashCommandBuilder()
    .setName('count')
    .setDescription('Verwalte das Zählspiel des Servers')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Starte ein Zählspiel in einem Textkanal')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Der Kanal, in dem gezählt wird')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((option) =>
          option
            .setName('system')
            .setDescription('Das Zahlensystem, das genutzt wird')
            .setRequired(true)
            .addChoices(...getCountingSystemChoices()),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('disable').setDescription('Deaktiviere das Zählspiel für diesen Server'),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('status').setDescription('Zeige den aktuellen Status des Zählspiels'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('reset')
        .setDescription('Setze die aktuelle Zählfolge zurück')
        .addIntegerOption((option) =>
          option
            .setName('start')
            .setDescription('Die Startzahl nach dem Zurücksetzen')
            .setMinValue(1),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('leaderboard').setDescription('Zeige die Bestenliste des Zählspiels'),
    ),
  category: 'Fun',

  async execute(interaction) {
    try {
      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) {
        logger.warn('Count command defer failed', { userId: interaction.user.id, guildId: interaction.guildId });
        return;
      }

      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Du brauchst die Berechtigung **Server verwalten**, um diesen Command zu nutzen.' });
      }

      const guildId = interaction.guildId!;
      const subcommand = interaction.options.getSubcommand();
      const config = await getCountingGameConfig(interaction.client, guildId);

      if (subcommand === 'setup') {
        const channel = interaction.options.getChannel('channel');
        const system = interaction.options.getString('system')!;
        if (!channel || channel.type !== ChannelType.GuildText) {
          return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Bitte wähle einen Textkanal für das Zählspiel.' });
        }

        if (config.enabled && config.channelId && config.channelId !== channel.id) {
          return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Auf diesem Server ist bereits ein Zählkanal aktiv: <#${config.channelId}>. Deaktiviere zuerst das aktuelle Zählspiel oder nutze diesen Kanal.` });
        }

        await activateCountingGame(interaction.client, guildId, channel.id, system);
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            successEmbed(
              'Zählspiel aktiviert',
              `Das Zählspiel ist jetzt in ${channel} mit dem System **${getCountingSystemLabel(system)}** aktiv. Gezählt wird ab **1**, und niemand darf zwei Zahlen hintereinander posten.`,
            ),
          ],
        });
      }

      if (subcommand === 'disable') {
        if (!config.enabled) {
          return await InteractionHelper.safeEditReply(interaction, {
            embeds: [infoEmbed('Zählspiel deaktiviert', 'Das Zählspiel ist auf diesem Server bereits deaktiviert.')],
          });
        }

        await disableCountingGame(interaction.client, guildId);
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed('Zählspiel deaktiviert', 'Das Zählspiel wurde deaktiviert.')],
        });
      }

      if (subcommand === 'status') {
        const fields = [
          { name: 'Aktiviert', value: config.enabled ? 'Ja' : 'Nein', inline: true },
          { name: 'Kanal', value: config.channelId ? `<#${config.channelId}>` : 'Nicht eingerichtet', inline: true },
          { name: 'System', value: getCountingSystemLabel(config.system), inline: true },
          { name: 'Nächste Zahl', value: getExpectedCountValue(config), inline: true },
          { name: 'Aktuelle Serie', value: `${config.currentStreak}`, inline: true },
          { name: 'Beste Serie', value: `${config.bestStreak || 0}`, inline: true },
          { name: 'Zuletzt gezählt von', value: config.lastUserId ? `<@${config.lastUserId}>` : 'Niemand', inline: true },
        ];

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: 'Status des Zählspiels',
              description: 'Übersicht über das aktuell eingerichtete Zählspiel.',
              fields,
              color: 'primary',
            }),
          ],
        });
      }

      if (subcommand === 'reset') {
        if (!config.enabled) {
          return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Aktiviere das Zählspiel zuerst mit `/count setup`.' });
        }

        const startNumber = interaction.options.getInteger('start') || 1;
        await resetCountingGame(interaction.client, guildId, startNumber);

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            successEmbed(
              'Zählspiel zurückgesetzt',
              `Die Zählfolge wurde zurückgesetzt. Fang in <#${config.channelId}> wieder mit **${startNumber}** an.`,
            ),
          ],
        });
      }

      if (subcommand === 'leaderboard') {
        const leaderboard = buildCountingLeaderboard(config, interaction.guild);

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: 'Bestenliste des Zählspiels',
              description: leaderboard.length > 0 ? leaderboard.join('\n') : 'Bisher wurde noch nicht gezählt.',
              color: 'primary',
            }),
          ],
        });
      }

      return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Bitte wähle eine gültige Aktion für das Zählspiel.' });
    } catch (error) {
      logger.error('Count command error:', error);
      return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Verwalten des Zählspiels ist etwas schiefgelaufen.' });
    }
  },
} satisfies Command;
