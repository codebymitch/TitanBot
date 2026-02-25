import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { EVENT_TYPES } from '../services/loggingService.js';

const EVENT_TYPES_BY_CATEGORY = Object.values(EVENT_TYPES).reduce((accumulator, eventType) => {
  const [category] = eventType.split('.');
  if (!accumulator[category]) {
    accumulator[category] = [];
  }
  accumulator[category].push(eventType);
  return accumulator;
}, {});





export function createLoggingButtons() {
  const buttons = [
    
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`logging_toggle:${EVENT_TYPES.MODERATION_BAN}`)
        .setLabel('🔨 Moderation')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`logging_toggle:${EVENT_TYPES.TICKET_CREATE}`)
        .setLabel('🎫 Tickets')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`logging_toggle:${EVENT_TYPES.MESSAGE_DELETE}`)
        .setLabel('❌ Messages')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`logging_toggle:${EVENT_TYPES.ROLE_CREATE}`)
        .setLabel('🏷️ Roles')
        .setStyle(ButtonStyle.Secondary)
    ),
    
    
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`logging_toggle:${EVENT_TYPES.MEMBER_JOIN}`)
        .setLabel('👋 Join/Leave')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`logging_toggle:${EVENT_TYPES.LEVELING_LEVELUP}`)
        .setLabel('📈 Leveling')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`logging_toggle:${EVENT_TYPES.REACTION_ROLE_ADD}`)
        .setLabel('🎭 Reactions')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`logging_toggle:${EVENT_TYPES.GIVEAWAY_CREATE}`)
        .setLabel('🎁 Giveaway')
        .setStyle(ButtonStyle.Secondary)
    ),

    
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('logging_toggle:counter.*')
        .setLabel('📊 Counter')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('logging_toggle:all')
        .setLabel('Toggle All')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('logging_refresh_status')
        .setLabel('🔄 Refresh')
        .setStyle(ButtonStyle.Primary)
    )
  ];

  return buttons;
}






export function getButtonStatusStyle(isEnabled) {
  return isEnabled ? ButtonStyle.Success : ButtonStyle.Danger;
}






export function createStatusIndicatorButtons(enabledEvents = {}, loggingEnabled = false) {
  const eventCategories = ['moderation', 'ticket', 'message', 'role', 'member', 'leveling', 'reactionrole', 'giveaway', 'counter'];
  const buttons = [];

  for (const category of eventCategories) {
    const categoryEvents = EVENT_TYPES_BY_CATEGORY[category] || [];
    const categoryWildcardDisabled = enabledEvents[`${category}.*`] === false;
    const categoryEventsEnabled = categoryEvents.length === 0
      ? true
      : categoryEvents.every((eventType) => enabledEvents[eventType] !== false);
    const isEnabled = loggingEnabled && !categoryWildcardDisabled && categoryEventsEnabled;

    const emoji = {
      'moderation': '🔨',
      'ticket': '🎫',
      'message': '❌',
      'role': '🏷️',
      'member': '👋',
      'leveling': '📈',
      'reactionrole': '🎭',
      'giveaway': '🎁',
      'counter': '📊'
    }[category] || '📌';

    buttons.push(
      new ButtonBuilder()
        .setCustomId(`logging_toggle:${category}.*`)
        .setLabel(`${emoji} ${category.charAt(0).toUpperCase() + category.slice(1)}`)
        .setStyle(isEnabled ? ButtonStyle.Success : ButtonStyle.Danger)
    );
  }

  if (buttons.length === 0) {
    return [];
  }

  
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    const rowButtons = buttons.slice(i, i + 5);
    rows.push(new ActionRowBuilder().addComponents(rowButtons));
  }

  return rows;
}

export function createLoggingStatusComponents(enabledEvents, loggingEnabled = false) {
  const categoryRows = createStatusIndicatorButtons(enabledEvents, loggingEnabled);

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('logging_toggle:audit_enabled')
      .setLabel(loggingEnabled ? '🧾 Audit: ON' : '🧾 Audit: OFF')
      .setStyle(loggingEnabled ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('logging_toggle:all')
      .setLabel('Toggle Categories')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('logging_refresh_status')
      .setLabel('🔄 Refresh')
      .setStyle(ButtonStyle.Primary)
  );

  return [...categoryRows, actionRow];
}






export function parseEventTypeFromButton(customId) {
  if (!customId.startsWith('logging_toggle:')) {
    return null;
  }

  return customId.replace('logging_toggle:', '');
}
