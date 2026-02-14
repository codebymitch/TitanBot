import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { EVENT_TYPES } from '../services/loggingService.js';

/**
 * Create logging control buttons for toggling event types
 * @returns {ActionRowBuilder[]} Array of button rows
 */
export function createLoggingButtons() {
  const buttons = [
    // Moderation row
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
    
    // Member and events row
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

    // Counter and special row
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

/**
 * Get button status color based on enabled/disabled state
 * @param {boolean} isEnabled
 * @returns {ButtonStyle}
 */
export function getButtonStatusStyle(isEnabled) {
  return isEnabled ? ButtonStyle.Success : ButtonStyle.Danger;
}

/**
 * Create an action row with status indicators
 * @param {Object} enabledEvents - Map of event types to their enabled status
 * @returns {ActionRowBuilder|null} Button row or null if too many events
 */
export function createStatusIndicatorButtons(enabledEvents) {
  const eventCategories = ['moderation', 'ticket', 'message', 'role', 'member', 'leveling', 'reactionrole', 'giveaway', 'counter'];
  const buttons = [];

  for (const category of eventCategories) {
    const categoryEntries = Object.entries(enabledEvents)
      .filter(([key]) => key.startsWith(category));
    const isEnabled = categoryEntries.length === 0
      ? true
      : categoryEntries.some(([, value]) => value !== false);

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

    // Discord has a max of 5 buttons per row
    if (buttons.length === 5) {
      break;
    }
  }

  if (buttons.length === 0) {
    return null;
  }

  return new ActionRowBuilder().addComponents(buttons);
}

/**
 * Parse event type from button custom ID
 * @param {string} customId
 * @returns {string|null}
 */
export function parseEventTypeFromButton(customId) {
  if (!customId.startsWith('logging_toggle:')) {
    return null;
  }

  return customId.replace('logging_toggle:', '');
}
