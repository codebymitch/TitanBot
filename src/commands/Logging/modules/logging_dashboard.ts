import type { Command, NexoClient, SubcommandModule } from '../../../types/index.js';
import { EmbedBuilder, MessageFlags, PermissionsBitField, type BaseInteraction, type Guild, type GuildMember, type MessageComponentInteraction, type ModalSubmitInteraction } from 'discord.js';
import { getColor } from '../../../config/bot.js';
import { getGuildConfig } from '../../../services/config/guildConfig.js';
import { getLoggingStatus } from '../../../services/loggingService.js';
import {
  createLoggingDashboardComponents,
  createLoggingCategoryViewComponents,
  createLoggingFilterComponents,
  DASHBOARD_CATEGORIES,
  DASHBOARD_CATEGORY_LABELS,
  EVENT_TYPES_BY_CATEGORY,
  type EnabledEventsMap,
} from '../../../utils/logging/loggingUi.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';

/** Interactions whose source message is the dashboard (buttons, selects, modals opened from it). */
type DashboardMessageInteraction = MessageComponentInteraction | ModalSubmitInteraction;

export function getCategoryStatus(enabledEvents: EnabledEventsMap | null | undefined, category: string, auditEnabled: boolean): boolean {
  if (!auditEnabled) return false;
  const events = enabledEvents || {};
  if (events[`${category}.*`] === false) return false;
  const categoryEvents = EVENT_TYPES_BY_CATEGORY[category] || [];
  if (categoryEvents.length === 0) return true;
  return categoryEvents.every((eventType) => events[eventType] !== false);
}

async function formatChannelMention(guild: Guild, id: string | null | undefined): Promise<string> {
  if (!id) return '`Nicht konfiguriert`';
  const channel = guild.channels.cache.get(id) ?? await guild.channels.fetch(id).catch(() => null);
  return channel ? channel.toString() : `⚠️ Fehlt (${id})`;
}

function countEnabledCategories(enabledEvents: EnabledEventsMap | null | undefined, auditEnabled: boolean) {
  const enabled = DASHBOARD_CATEGORIES.filter((key) =>
    getCategoryStatus(enabledEvents, key, auditEnabled),
  ).length;
  return { enabled, total: DASHBOARD_CATEGORIES.length };
}

export async function buildLoggingDashboardView(interaction: BaseInteraction, client: NexoClient) {
  const guildConfig = await getGuildConfig(client, interaction.guildId!);
  const loggingStatus = await getLoggingStatus(client, interaction.guildId!);

  const auditEnabled = Boolean(loggingStatus.enabled);
  const channels = loggingStatus.channels || {};

  const auditChannel = await formatChannelMention(interaction.guild!, channels.audit);
  const applicationsChannel = await formatChannelMention(interaction.guild!, channels.applications);
  const reportsChannel = await formatChannelMention(interaction.guild!, channels.reports);
  const lifecycleChannel = await formatChannelMention(interaction.guild!, guildConfig.ticketLogsChannelId);
  const transcriptChannel = await formatChannelMention(interaction.guild!, guildConfig.ticketTranscriptChannelId);

  const ignore = loggingStatus.ignore || { users: [], channels: [] };
  const { enabled: enabledCount, total } = countEnabledCategories(loggingStatus.enabledEvents, auditEnabled);

  const embed = new EmbedBuilder()
    .setTitle('📝 Logging-Dashboard')
    .setDescription(`Verwalte das Server-Logging für **${interaction.guild!.name}**. Nutze das Menü unten, um Kanäle, Kategorien und Filter einzustellen.`)
    .setColor(auditEnabled ? getColor('success') : getColor('warning'))
    .addFields(
      {
        name: 'Logging-Status',
        value: auditEnabled ? '✅ Aktiviert' : '❌ Deaktiviert',
        inline: true,
      },
      {
        name: 'Event-Kategorien',
        value: auditEnabled ? `${enabledCount}/${total} aktiviert` : '`Logging deaktiviert`',
        inline: true,
      },
      {
        name: 'Ignorierfilter',
        value: `${ignore.users?.length || 0} Nutzer · ${ignore.channels?.length || 0} Kanäle`,
        inline: true,
      },
      {
        name: 'Log-Kanäle',
        value: [
          `**Audit:** ${auditChannel}`,
          `**Bewerbungen:** ${applicationsChannel}`,
          `**Meldungen:** ${reportsChannel}`,
        ].join('\n'),
        inline: false,
      },
      {
        name: 'Ticket-Kanäle (nur lesen)',
        value: [
          `**Ticket-Logs:** ${lifecycleChannel}`,
          `**Transkripte:** ${transcriptChannel}`,
        ].join('\n'),
        inline: false,
      },
    )
    .setFooter({ text: 'Ticket-Kanäle: über /ticket dashboard einstellen' })
    .setTimestamp();

  const components = createLoggingDashboardComponents(loggingStatus.enabledEvents, auditEnabled);
  return { embed, components };
}

export async function buildLoggingCategoriesView(interaction: BaseInteraction, client: NexoClient) {
  const loggingStatus = await getLoggingStatus(client, interaction.guildId!);
  const auditEnabled = Boolean(loggingStatus.enabled);

  const categoryLines = DASHBOARD_CATEGORIES.map((key) => {
    const on = getCategoryStatus(loggingStatus.enabledEvents, key, auditEnabled);
    const label = DASHBOARD_CATEGORY_LABELS[key] || key;
    return `${on ? '✅' : '❌'} ${label}`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setTitle('📋 Event-Kategorien')
    .setDescription(
      auditEnabled
        ? 'Leg fest, welche Event-Arten in deinem Audit-Kanal geloggt werden.'
        : '⚠️ Logging ist deaktiviert. Aktivier es im Haupt-Dashboard, damit Logs gesendet werden.',
    )
    .setColor(getColor('info'))
    .addFields({ name: 'Kategorie-Status', value: categoryLines, inline: false })
    .setFooter({ text: 'Grün = Logging an · Rot = Logging aus' })
    .setTimestamp();

  const components = createLoggingCategoryViewComponents(loggingStatus.enabledEvents, auditEnabled);
  return { embed, components };
}

export async function buildLoggingFilterView(interaction: BaseInteraction, client: NexoClient) {
  const loggingStatus = await getLoggingStatus(client, interaction.guildId!);
  const ignore = loggingStatus.ignore || { users: [], channels: [] };

  const userLines = (ignore.users || []).length
    ? ignore.users.map((id) => `• Nutzer \`${id}\``).join('\n')
    : '*Keine ignorierten Nutzer*';

  const channelLines = (ignore.channels || []).length
    ? ignore.channels.map((id) => `• Kanal \`${id}\``).join('\n')
    : '*Keine ignorierten Kanäle*';

  const embed = new EmbedBuilder()
    .setTitle('🔇 Log-Ignorierfilter')
    .setDescription('Nutzer und Kanäle auf dieser Liste werden beim Senden von Audit-Logs übersprungen.')
    .setColor(getColor('info'))
    .addFields(
      { name: 'Ignorierte Nutzer', value: userLines.slice(0, 1024), inline: false },
      { name: 'Ignorierte Kanäle', value: channelLines.slice(0, 1024), inline: false },
    )
    .setFooter({ text: 'Nutze die Buttons unten, um Filter hinzuzufügen oder zu entfernen' })
    .setTimestamp();

  const components = createLoggingFilterComponents();
  return { embed, components };
}

export function isCategoriesView(interaction: DashboardMessageInteraction): boolean {
  return interaction.message?.embeds?.[0]?.title === '📋 Event-Kategorien';
}

export function isFilterView(interaction: DashboardMessageInteraction): boolean {
  return interaction.message?.embeds?.[0]?.title === '🔇 Log-Ignorierfilter';
}

export async function refreshDashboardMessage(interaction: DashboardMessageInteraction, client: NexoClient): Promise<void> {
  let view;
  if (isCategoriesView(interaction)) {
    view = await buildLoggingCategoriesView(interaction, client);
  } else if (isFilterView(interaction)) {
    view = await buildLoggingFilterView(interaction, client);
  } else {
    view = await buildLoggingDashboardView(interaction, client);
  }

  await interaction.message!.edit({
    embeds: [view.embed],
    components: view.components,
    content: null,
  }).catch(() => {});
}

export default {
  prefixOnly: false,
  async execute(interaction, config, client) {
    try {
      if (!(interaction.member as GuildMember).permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Du brauchst die Berechtigung **Server verwalten**, um das Logging-Dashboard zu sehen.' });
      }

      await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      const { embed, components } = await buildLoggingDashboardView(interaction, client);
      await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components });
    } catch (error) {
      logger.error('logging_dashboard error:', error);
      await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Das Logging-Dashboard konnte nicht geladen werden.' });
    }
  },
} satisfies SubcommandModule & Pick<Command, 'prefixOnly'>;
