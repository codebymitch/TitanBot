/**
 * Middleman System Buttons
 * 
 * Contains all button factory functions for the MM ticket system.
 * Includes status buttons, close buttons, and reputation buttons.
 */

import { ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import mmConfig from '../../config/mmConfig.js';

// Button custom IDs
const ButtonCustomIds = {
  // Status buttons
  STATUS_WAITING_PAYMENT: 'mm_status_waiting_payment',
  STATUS_PAYMENT_RECEIVED: 'mm_status_payment_received',
  STATUS_ITEM_DELIVERED: 'mm_status_item_delivered',
  STATUS_TRADE_COMPLETED: 'mm_status_trade_completed',
  STATUS_CANCEL_TRADE: 'mm_status_cancel_trade',
  
  // Ticket actions
  CLOSE_TICKET: 'mm_close_ticket',
  CLAIM_TICKET: 'mm_claim_ticket',
  
  // Reputation
  GIVE_POSITIVE_REP: 'mm_rep_positive',
  GIVE_NEGATIVE_REP: 'mm_rep_negative',
  
  // Info
  SHOW_TICKET_INFO: 'mm_ticket_info'
};

/**
 * Create the status control buttons row
 * @returns {ActionRowBuilder[]}
 */
function createStatusButtons() {
  const row1 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(ButtonCustomIds.STATUS_WAITING_PAYMENT)
        .setLabel('⏳ Waiting Payment')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('⏳'),
      
      new ButtonBuilder()
        .setCustomId(ButtonCustomIds.STATUS_PAYMENT_RECEIVED)
        .setLabel('💰 Payment Received')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('💰'),
      
      new ButtonBuilder()
        .setCustomId(ButtonCustomIds.STATUS_ITEM_DELIVERED)
        .setLabel('📦 Item Delivered')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📦')
    );

  const row2 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(ButtonCustomIds.STATUS_TRADE_COMPLETED)
        .setLabel('✅ Trade Completed')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      
      new ButtonBuilder()
        .setCustomId(ButtonCustomIds.STATUS_CANCEL_TRADE)
        .setLabel('❌ Cancel Trade')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    );

  return [row1, row2];
}

/**
 * Create the welcome/info buttons row
 * @returns {ActionRowBuilder[]}
 */
function createWelcomeButtons() {
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(ButtonCustomIds.CLAIM_TICKET)
        .setLabel('🛡️ Claim as Middleman')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🛡️'),
      
      new ButtonBuilder()
        .setCustomId(ButtonCustomIds.SHOW_TICKET_INFO)
        .setLabel('📋 View Ticket Info')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📋')
    );

  return [row];
}

/**
 * Create the close ticket button
 * @returns {ActionRowBuilder[]}
 */
function createCloseButton() {
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(ButtonCustomIds.CLOSE_TICKET)
        .setLabel('🔒 Close Ticket')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔒')
    );

  return [row];
}

/**
 * Create reputation buttons (shown after trade completion)
 * @returns {ActionRowBuilder[]}
 */
function createReputationButtons() {
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(ButtonCustomIds.GIVE_POSITIVE_REP)
        .setLabel('✅ Give Positive Rep')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      
      new ButtonBuilder()
        .setCustomId(ButtonCustomIds.GIVE_NEGATIVE_REP)
        .setLabel('❌ Report Issue')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    );

  return [row];
}

/**
 * Create a single button for specific status
 * @param {string} status - The status to create button for
 * @returns {ButtonBuilder}
 */
function createStatusButton(status) {
  const statusConfig = {
    waiting_payment: {
      label: '⏳ Waiting Payment',
      style: ButtonStyle.Primary,
      emoji: '⏳'
    },
    payment_received: {
      label: '💰 Payment Received',
      style: ButtonStyle.Primary,
      emoji: '💰'
    },
    item_delivered: {
      label: '📦 Item Delivered',
      style: ButtonStyle.Primary,
      emoji: '📦'
    },
    trade_completed: {
      label: '✅ Trade Completed',
      style: ButtonStyle.Success,
      emoji: '✅'
    },
    cancelled: {
      label: '❌ Cancelled',
      style: ButtonStyle.Danger,
      emoji: '❌'
    }
  };

  const config = statusConfig[status] || statusConfig.waiting_payment;
  const customId = `mm_status_${status}`;

  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(config.label)
    .setStyle(config.style)
    .setEmoji(config.emoji);
}

/**
 * Create a disabled status button (for showing current status)
 * @param {string} status - The current status
 * @returns {ButtonBuilder}
 */
function createDisabledStatusButton(status) {
  const config = {
    waiting_payment: { label: '⏳ Waiting Payment', emoji: '⏳' },
    payment_received: { label: '💰 Payment Received', emoji: '💰' },
    item_delivered: { label: '📦 Item Delivered', emoji: '📦' },
    trade_completed: { label: '✅ Trade Completed', emoji: '✅' },
    cancelled: { label: '❌ Cancelled', emoji: '❌' }
  };

  const buttonConfig = config[status] || config.waiting_payment;

  return new ButtonBuilder()
    .setCustomId(`mm_status_${status}_disabled`)
    .setLabel(buttonConfig.label)
    .setStyle(ButtonStyle.Secondary)
    .setEmoji(buttonConfig.emoji)
    .setDisabled(true);
}

/**
 * Create status buttons with current status highlighted
 * @param {string} currentStatus - The current status to highlight
 * @returns {ActionRowBuilder[]}
 */
function createStatusButtonsWithCurrent(currentStatus) {
  const statuses = [
    'waiting_payment',
    'payment_received',
    'item_delivered',
    'trade_completed',
    'cancelled'
  ];

  const buttons = statuses.map(status => {
    if (status === currentStatus) {
      return createDisabledStatusButton(status);
    }
    return createStatusButton(status);
  });

  // Split into rows of 5
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(
      new ActionRowBuilder().addComponents(buttons.slice(i, i + 5))
    );
  }

  return rows;
}

export {
  ButtonCustomIds,
  createStatusButtons,
  createWelcomeButtons,
  createCloseButton,
  createReputationButtons,
  createStatusButton,
  createDisabledStatusButton,
  createStatusButtonsWithCurrent
};

export default {
  customIds: ButtonCustomIds,
  status: createStatusButtons,
  welcome: createWelcomeButtons,
  close: createCloseButton,
  reputation: createReputationButtons,
  singleStatus: createStatusButton,
  disabledStatus: createDisabledStatusButton,
  statusWithCurrent: createStatusButtonsWithCurrent
};