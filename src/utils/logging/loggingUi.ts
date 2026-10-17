// loggingUi.js

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import type { MessageActionRowComponentBuilder } from 'discord.js';
import { EVENT_TYPES } from '../../services/loggingService.js';

/** Per-event-type toggle map stored in the guild logging config (`false` = disabled). */
export type EnabledEventsMap = Record<string, boolean | undefined>;

const EVENT_TYPES_BY_CATEGORY = Object.values(EVENT_TYPES).reduce<Record<string, string[]>>((accumulator, eventType) => {
  const [category] = eventType.split('.');
  if (!accumulator[category]) {
    accumulator[category] = [];
  }
  accumulator[category].push(eventType);
  return accumulator;
}, {});

export const DASHBOARD_CATEGORIES = [
  'moderation',
  'message',
  'role',
  'member',
  'leveling',
  'reactionrole',
  'giveaway',
  'counter',
  'application',
  'report',
];

const DASHBOARD_CATEGORY_EMOJIS: Record<string, string> = {
  moderation: '🔨',
  message: '✉️',
  role: '🏷️',
  member: '👥',
  leveling: '📈',
  reactionrole: '🎭',
  giveaway: '🎁',
  counter: '📊',
  application: '📝',
  report: '🚨',
};

export const DASHBOARD_CATEGORY_LABELS: Record<string, string> = {
  moderation: 'Moderation',
  message: 'Nachrichten',
  role: 'Rollen',
  member: 'Mitglieder',
  leveling: 'Leveling',
  reactionrole: 'Reaktionsrollen',
  giveaway: 'Giveaways',
  counter: 'Zähler',
  application: 'Bewerbungen',
  report: 'Meldungen',
};

function createBackButton(): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId('log_dash_back')
    .setLabel('Zurück zum Dashboard')
    .setStyle(ButtonStyle.Secondary);
}

function createCategoryToggleButtons(enabledEvents: EnabledEventsMap = {}, loggingEnabled: boolean = false): ActionRowBuilder<ButtonBuilder>[] {
  const buttons = DASHBOARD_CATEGORIES.map((category) => {
    const wildcardDisabled = enabledEvents[`${category}.*`] === false;
    const categoryEvents = EVENT_TYPES_BY_CATEGORY[category] || [];
    const allEnabled = categoryEvents.length === 0
      ? true
      : categoryEvents.every((t) => enabledEvents[t] !== false);
    const isEnabled = loggingEnabled && !wildcardDisabled && allEnabled;
    const emoji = DASHBOARD_CATEGORY_EMOJIS[category] || '📌';
    const label = DASHBOARD_CATEGORY_LABELS[category] || category;

    return new ButtonBuilder()
      .setCustomId(`log_dash_toggle:${category}.*`)
      .setLabel(`${emoji} ${label}`)
      .setStyle(isEnabled ? ButtonStyle.Success : ButtonStyle.Danger);
  });

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 5)));
  }
  return rows;
}

export function createLoggingMainMenuSelect(): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('log_dash_menu')
      .setPlaceholder('Wähle eine Einstellung…')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('Audit-Log-Kanal festlegen')
          .setDescription('Moderation, Nachrichten, Mitglieder, Rollen usw.')
          .setValue('set:audit')
          .setEmoji('🧾'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Bewerbungskanal festlegen')
          .setDescription('Neue Bewerbungen und Status-Updates')
          .setValue('set:applications')
          .setEmoji('📝'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Meldungskanal festlegen')
          .setDescription('Meldungen von Nutzern über /report')
          .setValue('set:reports')
          .setEmoji('🚨'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Audit-Kanal entfernen')
          .setValue('clear:audit')
          .setEmoji('🗑️'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Bewerbungskanal entfernen')
          .setValue('clear:applications')
          .setEmoji('🗑️'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Meldungskanal entfernen')
          .setValue('clear:reports')
          .setEmoji('🗑️'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Event-Kategorien')
          .setDescription('Lege fest, welche Log-Typen gesendet werden')
          .setValue('view:categories')
          .setEmoji('📋'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Ignorier-Filter verwalten')
          .setDescription('Logs von bestimmten Nutzern oder Kanälen überspringen')
          .setValue('view:filters')
          .setEmoji('🔇'),
      ),
  );
}

export function createLoggingMainActionRow(loggingEnabled: boolean = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('log_dash_toggle:audit_enabled')
      .setLabel('Audit-Logging')
      .setStyle(loggingEnabled ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('log_dash_refresh')
      .setLabel('Aktualisieren')
      .setStyle(ButtonStyle.Primary),
  );
}

export function createLoggingDashboardComponents(_enabledEvents: EnabledEventsMap | null | undefined, loggingEnabled: boolean = false): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  return [
    createLoggingMainMenuSelect(),
    createLoggingMainActionRow(loggingEnabled),
  ];
}

export function createLoggingCategoryViewComponents(enabledEvents: EnabledEventsMap | undefined, loggingEnabled: boolean = false): ActionRowBuilder<ButtonBuilder>[] {
  const categoryRows = createCategoryToggleButtons(enabledEvents, loggingEnabled);

  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    createBackButton(),
    new ButtonBuilder()
      .setCustomId('log_dash_toggle:all')
      .setLabel('Alle Kategorien umschalten')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('log_dash_refresh')
      .setLabel('Aktualisieren')
      .setStyle(ButtonStyle.Primary),
  );

  return [...categoryRows, actionRow];
}

export function createLoggingFilterComponents(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      createBackButton(),
      new ButtonBuilder()
        .setCustomId('log_dash_add_filter:user')
        .setLabel('Nutzerfilter hinzufügen')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('log_dash_add_filter:channel')
        .setLabel('Kanalfilter hinzufügen')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('log_dash_remove_filter')
        .setLabel('Filter entfernen')
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

export { EVENT_TYPES_BY_CATEGORY };
