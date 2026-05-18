/**
 * Middleman System Modals
 * 
 * Contains all modal factory functions for the MM ticket system.
 * Includes the create ticket modal and reputation modal.
 */

import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';

// Modal custom IDs
const ModalCustomIds = {
  CREATE_TICKET: 'mm_create_ticket',
  GIVE_REPUTATION: 'mm_give_reputation'
};

// Text input custom IDs
const TextInputIds = {
  BUYER: 'mm_buyer',
  SELLER: 'mm_seller',
  PRODUCT: 'mm_product',
  VALUE: 'mm_value',
  REP_TYPE: 'mm_rep_type',
  REP_COMMENT: 'mm_rep_comment'
};

/**
 * Create the "Create Ticket" modal
 * @returns {ModalBuilder}
 */
function createTicketModal() {
  const modal = new ModalBuilder()
    .setCustomId(ModalCustomIds.CREATE_TICKET)
    .setTitle('🛡️ Create Middleman Trade');

  // Buyer input
  const buyerInput = new TextInputBuilder()
    .setCustomId(TextInputIds.BUYER)
    .setLabel('Buyer (User ID or @mention)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., 123456789 or @username')
    .setRequired(true)
    .setMaxLength(50);

  // Seller input
  const sellerInput = new TextInputBuilder()
    .setCustomId(TextInputIds.SELLER)
    .setLabel('Seller (User ID or @mention)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., 987654321 or @username')
    .setRequired(true)
    .setMaxLength(50);

  // Product input
  const productInput = new TextInputBuilder()
    .setCustomId(TextInputIds.PRODUCT)
    .setLabel('Product / Service')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., Discord Nitro, Discord Server, etc.')
    .setRequired(true)
    .setMaxLength(100);

  // Value input
  const valueInput = new TextInputBuilder()
    .setCustomId(TextInputIds.VALUE)
    .setLabel('Trade Value')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., 50 BRL, $10 USD, etc.')
    .setRequired(true)
    .setMaxLength(50);

  // Add inputs to action rows
  const row1 = new ActionRowBuilder().addComponents(buyerInput);
  const row2 = new ActionRowBuilder().addComponents(sellerInput);
  const row3 = new ActionRowBuilder().addComponents(productInput);
  const row4 = new ActionRowBuilder().addComponents(valueInput);

  // Add rows to modal
  modal.addComponents(row1, row2, row3, row4);

  return modal;
}

/**
 * Create the "Give Reputation" modal
 * @param {string} repType - The type of reputation ('positive' or 'negative')
 * @returns {ModalBuilder}
 */
function createReputationModal(repType = 'positive') {
  const modal = new ModalBuilder()
    .setCustomId(`${ModalCustomIds.GIVE_REPUTATION}_${repType}`)
    .setTitle(`${repType === 'positive' ? '✅' : '❌'} Give ${repType === 'positive' ? 'Positive' : 'Negative'} Reputation`);

  // Reputation type (hidden, passed through custom ID)
  const repTypeInput = new TextInputBuilder()
    .setCustomId(TextInputIds.REP_TYPE)
    .setLabel('Reputation Type')
    .setStyle(TextInputStyle.Short)
    .setValue(repType)
    .setRequired(true)
    .setDisabled(true);

  // Comment input
  const commentInput = new TextInputBuilder()
    .setCustomId(TextInputIds.REP_COMMENT)
    .setLabel('Comment (Optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Describe your experience with this trader...')
    .setRequired(false)
    .setMaxLength(500);

  const row1 = new ActionRowBuilder().addComponents(repTypeInput);
  const row2 = new ActionRowBuilder().addComponents(commentInput);

  modal.addComponents(row1, row2);

  return modal;
}

/**
 * Parse the create ticket modal response
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 * @returns {Object} Parsed modal data
 */
function parseCreateTicketModal(interaction) {
  const buyer = interaction.fields.getTextInputValue(TextInputIds.BUYER).trim();
  const seller = interaction.fields.getTextInputValue(TextInputIds.SELLER).trim();
  const product = interaction.fields.getTextInputValue(TextInputIds.PRODUCT).trim();
  const value = interaction.fields.getTextInputValue(TextInputIds.VALUE).trim();

  return {
    buyer,
    seller,
    product,
    value
  };
}

/**
 * Parse the reputation modal response
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 * @returns {Object} Parsed modal data
 */
function parseReputationModal(interaction) {
  // Get rep type from custom ID
  const repType = interaction.customId.split('_').pop() || 'positive';
  const comment = interaction.fields.getTextInputValue(TextInputIds.REP_COMMENT)?.trim() || '';

  return {
    repType,
    comment
  };
}

export {
  ModalCustomIds,
  TextInputIds,
  createTicketModal,
  createReputationModal,
  parseCreateTicketModal,
  parseReputationModal
};

export default {
  customIds: ModalCustomIds,
  textInputIds: TextInputIds,
  createTicket: createTicketModal,
  createReputation: createReputationModal,
  parseCreateTicket: parseCreateTicketModal,
  parseReputation: parseReputationModal
};