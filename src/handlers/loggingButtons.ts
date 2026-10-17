import {
  PermissionFlagsBits,
  ChannelSelectMenuBuilder,
  ChannelType,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
} from 'discord.js';
import type {
  ButtonInteraction,
  GuildMember,
  ModalSubmitInteraction,
  SelectMenuModalData,
  StringSelectMenuInteraction,
} from 'discord.js';
import {
  toggleEventLogging,
  getLoggingStatus,
  EVENT_TYPES,
  setLoggingEnabled,
  setLogChannel,
  updateIgnoreList,
  getIgnoreList,
} from '../services/loggingService.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { successEmbed } from '../utils/embeds.js';
import { replyUserError, ErrorTypes, handleInteractionError } from '../utils/errorHandler.js';
import { logger } from '../utils/logger.js';
import {
  buildLoggingDashboardView,
  buildLoggingCategoriesView,
  buildLoggingFilterView,
  isCategoriesView,
  isFilterView,
  refreshDashboardMessage,
} from '../commands/Logging/modules/logging_dashboard.js';

const LOGGING_CATEGORIES = [...new Set(Object.values(EVENT_TYPES).map((eventType) => eventType.split('.')[0]))];

const DESTINATION_LABELS: Record<string, string> = {
  audit: 'Audit-Log',
  applications: 'Bewerbungen',
  reports: 'Meldungen',
};

export default {
  customIds: [
    'log_dash_toggle',
    'log_dash_refresh',
    'log_dash_back',
    'log_dash_add_filter',
    'log_dash_remove_filter',
  ],

  async execute(interaction: ButtonInteraction): Promise<unknown> {
    try {
      if (!(interaction.member as GuildMember).permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          content: '❌ Dafür brauchst du die Berechtigung **Server verwalten**.',
          ephemeral: true,
        });
      }

      if (interaction.customId === 'log_dash_refresh') {
        return handleRefresh(interaction);
      }

      if (interaction.customId === 'log_dash_back') {
        return handleBackToMain(interaction);
      }

      if (interaction.customId === 'log_dash_remove_filter') {
        return handleRemoveFilterModal(interaction);
      }

      if (interaction.customId.startsWith('log_dash_add_filter:')) {
        return handleAddFilterModal(interaction);
      }

      if (interaction.customId.startsWith('log_dash_toggle')) {
        return handleToggle(interaction);
      }
    } catch (error) {
      await handleInteractionError(interaction, error, {
        type: 'button',
        customId: interaction.customId,
        handler: 'logging',
      });
    }
  },
};

async function handleRefresh(interaction: ButtonInteraction) {
  if (isCategoriesView(interaction)) {
    const { embed, components } = await buildLoggingCategoriesView(interaction, interaction.client);
    return interaction.update({ embeds: [embed], components, content: null });
  }

  if (isFilterView(interaction)) {
    const { embed, components } = await buildLoggingFilterView(interaction, interaction.client);
    return interaction.update({ embeds: [embed], components, content: null });
  }

  const { embed, components } = await buildLoggingDashboardView(interaction, interaction.client);
  await interaction.update({ embeds: [embed], components, content: null });
}

async function handleBackToMain(interaction: ButtonInteraction) {
  const { embed, components } = await buildLoggingDashboardView(interaction, interaction.client);
  await interaction.update({ embeds: [embed], components, content: null });
}

async function handleToggle(interaction: ButtonInteraction) {
  const eventType = interaction.customId.replace('log_dash_toggle:', '');
  if (!eventType) {
    return interaction.reply({ content: '❌ Ungültiger Event-Typ.', ephemeral: true });
  }

  const status = await getLoggingStatus(interaction.client, interaction.guildId!);
  const onCategoriesView = isCategoriesView(interaction);

  if (eventType === 'audit_enabled') {
    await setLoggingEnabled(interaction.client, interaction.guildId!, !Boolean(status.enabled));
  } else if (eventType === 'all') {
    const newState = !Object.values(status.enabledEvents).every((v) => v !== false);
    const allTypes = Object.values(EVENT_TYPES);
    const categoryTypes = LOGGING_CATEGORIES.map((c) => `${c}.*`);
    await toggleEventLogging(interaction.client, interaction.guildId!, [...allTypes, ...categoryTypes], newState);
  } else {
    const currentState = status.enabledEvents[eventType] !== false;
    await toggleEventLogging(interaction.client, interaction.guildId!, eventType, !currentState);
  }

  if (onCategoriesView || (eventType !== 'audit_enabled' && eventType.includes('.*'))) {
    const { embed, components } = await buildLoggingCategoriesView(interaction, interaction.client);
    return interaction.update({ embeds: [embed], components, content: null });
  }

  const { embed, components } = await buildLoggingDashboardView(interaction, interaction.client);
  await interaction.update({ embeds: [embed], components, content: null });
}

async function handleAddFilterModal(interaction: ButtonInteraction) {
  const filterType = interaction.customId.replace('log_dash_add_filter:', '');
  if (filterType !== 'user' && filterType !== 'channel') {
    return interaction.reply({ content: '❌ Ungültiger Filtertyp.', ephemeral: true });
  }

  const modalCustomId = `log_dash_filter_modal:add:${filterType}`;

  let modal: ModalBuilder;
  if (filterType === 'user') {
    const userSelect = new UserSelectMenuBuilder()
      .setCustomId('ignore_user')
      .setPlaceholder('Wähl einen Nutzer zum Ignorieren…')
      .setMinValues(1)
      .setMaxValues(1);

    const userLabel = new LabelBuilder()
      .setLabel('Zu ignorierender Nutzer')
      .setDescription('Wähl einen Nutzer, dessen Aktionen nicht geloggt werden sollen')
      .setUserSelectMenuComponent(userSelect);

    modal = new ModalBuilder()
      .setCustomId(modalCustomId)
      .setTitle('Nutzer-Filter hinzufügen')
      .addLabelComponents(userLabel);
  } else {
    const channelSelect = new ChannelSelectMenuBuilder()
      .setCustomId('ignore_channel')
      .setPlaceholder('Wähl einen Kanal zum Ignorieren…')
      .setMinValues(1)
      .setMaxValues(1)
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice);

    const channelLabel = new LabelBuilder()
      .setLabel('Zu ignorierender Kanal')
      .setDescription('Wähl einen Kanal, dessen Events nicht geloggt werden sollen')
      .setChannelSelectMenuComponent(channelSelect);

    modal = new ModalBuilder()
      .setCustomId(modalCustomId)
      .setTitle('Kanal-Filter hinzufügen')
      .addLabelComponents(channelLabel);
  }

  await interaction.showModal(modal);

  try {
    const modalSubmission = await interaction.awaitModalSubmit({
      time: 5 * 60 * 1000,
      filter: (i: ModalSubmitInteraction) => i.user.id === interaction.user.id && i.customId === modalCustomId,
    });

    let id;
    if (filterType === 'user') {
      id = (modalSubmission.fields.getField('ignore_user') as SelectMenuModalData)?.values?.[0];
    } else {
      id = (modalSubmission.fields.getField('ignore_channel') as SelectMenuModalData)?.values?.[0];
    }

    if (!id) {
      return replyUserError(modalSubmission, {
        type: ErrorTypes.VALIDATION,
        message: `Bitte wähl ${filterType === 'user' ? 'einen Nutzer' : 'einen Kanal'} zum Ignorieren aus.`,
      });
    }

    await updateIgnoreList(interaction.client, interaction.guildId!, { action: 'add', type: filterType, id });

    await modalSubmission.reply({
      embeds: [successEmbed('Filter hinzugefügt', `${filterType === 'user' ? 'Nutzer' : 'Kanal'} \`${id}\` wird in den Audit-Logs ignoriert.`)],
      flags: MessageFlags.Ephemeral,
    });

    if (isFilterView(interaction)) {
      await refreshDashboardMessage(interaction, interaction.client);
    }
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'INTERACTION_TIMEOUT') {
      return;
    }
    logger.error('Error in add filter modal:', error);
  }
}

async function handleRemoveFilterModal(interaction: ButtonInteraction) {
  const config = await getGuildConfig(interaction.client, interaction.guildId!);
  const ignore = getIgnoreList(config);
  const options: StringSelectMenuOptionBuilder[] = [];

  for (const userId of ignore.users || []) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(`Nutzer ${userId}`)
        .setDescription('Diesen Nutzer von der Ignorierliste entfernen')
        .setValue(`user:${userId}`),
    );
  }

  for (const channelId of ignore.channels || []) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(`Kanal ${channelId}`)
        .setDescription('Diesen Kanal von der Ignorierliste entfernen')
        .setValue(`channel:${channelId}`),
    );
  }

  if (options.length === 0) {
    return replyUserError(interaction, {
      type: ErrorTypes.USER_INPUT,
      message: 'Es gibt keine Ignorierfilter zum Entfernen.',
    });
  }

  const modalCustomId = 'log_dash_filter_modal:remove';

  const filterSelect = new StringSelectMenuBuilder()
    .setCustomId('filter_entry')
    .setPlaceholder('Wähl einen Filter zum Entfernen…')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options.slice(0, 25));

  const filterLabel = new LabelBuilder()
    .setLabel('Zu entfernender Filter')
    .setDescription('Wähl einen Nutzer oder Kanal, der nicht mehr ignoriert werden soll')
    .setStringSelectMenuComponent(filterSelect);

  const modal = new ModalBuilder()
    .setCustomId(modalCustomId)
    .setTitle('Ignorierfilter entfernen')
    .addLabelComponents(filterLabel);

  await interaction.showModal(modal);

  try {
    const modalSubmission = await interaction.awaitModalSubmit({
      time: 5 * 60 * 1000,
      filter: (i: ModalSubmitInteraction) => i.user.id === interaction.user.id && i.customId === modalCustomId,
    });

    const entry = (modalSubmission.fields.getField('filter_entry') as SelectMenuModalData)?.values?.[0];
    if (!entry) {
      return replyUserError(modalSubmission, {
        type: ErrorTypes.VALIDATION,
        message: 'Bitte wähl einen Filter zum Entfernen aus.',
      });
    }

    const [type, id] = entry.split(':');
    await updateIgnoreList(interaction.client, interaction.guildId!, { action: 'remove', type, id });

    await modalSubmission.reply({
      embeds: [successEmbed('Filter entfernt', `${type === 'user' ? 'Nutzer' : 'Kanal'} \`${id}\` wurde von der Ignorierliste entfernt.`)],
      flags: MessageFlags.Ephemeral,
    });

    if (isFilterView(interaction)) {
      await refreshDashboardMessage(interaction, interaction.client);
    }
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'INTERACTION_TIMEOUT') {
      return;
    }
    logger.error('Error in remove filter modal:', error);
  }
}

async function showChannelModal(interaction: StringSelectMenuInteraction, destination: string) {
  const label = DESTINATION_LABELS[destination] || destination;
  const modalCustomId = `log_dash_channel_modal:${destination}`;

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId('log_channel')
    .setPlaceholder('Wähl einen Textkanal…')
    .setMinValues(1)
    .setMaxValues(1)
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setRequired(true);

  const channelLabel = new LabelBuilder()
    .setLabel(`${label}-Kanal`)
    .setDescription(`Kanal, in den die ${label}-Logs gesendet werden`)
    .setChannelSelectMenuComponent(channelSelect);

  const modal = new ModalBuilder()
    .setCustomId(modalCustomId)
    .setTitle(`${label}-Kanal festlegen`)
    .addLabelComponents(channelLabel);

  await interaction.showModal(modal);

  try {
    const modalSubmission = await interaction.awaitModalSubmit({
      time: 5 * 60 * 1000,
      filter: (i: ModalSubmitInteraction) => i.user.id === interaction.user.id && i.customId === modalCustomId,
    });

    const channelId = (modalSubmission.fields.getField('log_channel') as SelectMenuModalData).values[0];
    const channel = interaction.guild!.channels.cache.get(channelId)
      ?? await interaction.guild!.channels.fetch(channelId).catch(() => null);

    if (!channel) {
      return modalSubmission.reply({
        content: '❌ Dieser Kanal wurde nicht gefunden.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const botPerms = channel.permissionsFor(interaction.guild!.members.me!);
    if (!botPerms?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
      return modalSubmission.reply({
        content: '❌ Ich brauche in diesem Kanal die Berechtigungen „Kanal ansehen“, „Nachrichten senden“ und „Links einbetten“.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await setLogChannel(interaction.client, interaction.guildId!, destination, channel.id);

    await modalSubmission.reply({
      embeds: [successEmbed('Kanal aktualisiert', `**${label}**-Logs werden jetzt an ${channel} gesendet.`)],
      flags: MessageFlags.Ephemeral,
    });

    await refreshDashboardMessage(interaction, interaction.client);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'INTERACTION_TIMEOUT') {
      return;
    }
    await handleInteractionError(interaction, error, {
      type: 'modal',
      customId: interaction.customId,
      handler: 'logging_channel',
    });
  }
}

export async function handleLoggingMenuSelect(interaction: StringSelectMenuInteraction): Promise<unknown> {
  if (!(interaction.member as GuildMember).permissions.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({
      content: '❌ Dafür brauchst du die Berechtigung **Server verwalten**.',
      ephemeral: true,
    });
  }

  const value = interaction.values[0];

  if (value.startsWith('set:')) {
    const destination = value.replace('set:', '');
    return showChannelModal(interaction, destination);
  }

  if (value.startsWith('clear:')) {
    const destination = value.replace('clear:', '');
    await setLogChannel(interaction.client, interaction.guildId!, destination, null);
    const { embed, components } = await buildLoggingDashboardView(interaction, interaction.client);
    return interaction.update({
      embeds: [embed],
      components,
      content: null,
    });
  }

  if (value === 'view:categories') {
    const { embed, components } = await buildLoggingCategoriesView(interaction, interaction.client);
    return interaction.update({ embeds: [embed], components, content: null });
  }

  if (value === 'view:filters') {
    const { embed, components } = await buildLoggingFilterView(interaction, interaction.client);
    return interaction.update({ embeds: [embed], components, content: null });
  }

  return interaction.reply({ content: '❌ Unbekannte Option.', ephemeral: true });
}
