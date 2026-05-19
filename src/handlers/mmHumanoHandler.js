/**
 * Middleman Humano Handler - Sistema Sem Banco de Dados (VERSÃO CORRIGIDA)
 * 
 * Handles the multi-step ephemeral configuration menu for the MM system.
 * All state is stored in the channel topic (MM_DATA:buyer=id|seller=id|method=PIX|status=OPEN|mm=id).
 * No database dependency - completely self-contained.
 * 
 * CORREÇÕES APLICADAS:
 * - Prevenção de criação duplicada de canais
 * - Sistema de locking para evitar race conditions
 * - Validação de canal existente antes de criar
 * - Cooldown entre tentativas
 */

import {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  ChannelType
} from 'discord.js';
import mmConfig from '../config/mmConfig.js';
import { logger } from '../utils/logger.js';
import { safeShowModal } from '../utils/interactionValidator.js';

// Custom IDs for the wizard
export const WIZARD_IDS = {
  START: 'mm_start_intermediacao',
  PAYMENT_SELECT: 'mm_payment_select',
  ROLE_SELECT: 'mm_role_select',
  AMOUNT_MODAL_SUBMIT: 'mm_amount_modal',
  COUNTERPARTY_SELECT: 'mm_counterparty_select',
  REQUEST_MM: 'mm_request_middleman',
  CLAIM_MM: 'mm_claim_middleman',
  CONFIRM_DELIVERY: 'mm_confirm_entrega',
  CONFIRM_DELIVERY_MODAL: 'mm_confirmacao_entrega',
  FINALIZE_MM: 'mm_finalizar_intermediacao',
  CLOSE_MM: 'mm_close_intermediacao',
  CLOSE_TICKET_COMMAND: 'mm_close_ticket_cmd'
};

// Wizard state stored in memory (per user, temporary)
const wizardStates = new Map();

// Track users currently in the wizard to prevent duplicate starts
const usersInWizard = new Set();

// Track channels being claimed to prevent race conditions and duplicate messages
const claimingChannels = new Set();
const claimTimeout = 15000; // 15 seconds timeout

// Cooldown map to prevent spam (user ID -> timestamp)
const userCooldowns = new Map();
const COOLDOWN_MS = 30000; // 30 seconds cooldown between creating tickets

/**
 * Create the payment method selection embed
 */
function createPaymentSelectEmbed() {
  return new EmbedBuilder()
    .setColor(0x3498DB)
    .setTitle('💳 Passo 1/4 - Método de Pagamento')
    .setDescription('```' +
      '┌────────────────────────────────────────┐\n' +
      '│  Selecione o método de pagamento que   │\n' +
      '│  será utilizado na intermediação.      │\n' +
      '└────────────────────────────────────────┘\n' +
      '```'
    )
    .setFooter({ text: 'Configuração de Intermediação' })
    .setTimestamp();
}

/**
 * Create the payment method select menu
 */
function createPaymentSelectMenu() {
  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(WIZARD_IDS.PAYMENT_SELECT)
        .setPlaceholder('Selecione o método de pagamento...')
        .addOptions([
          {
            label: 'PIX',
            description: 'Pagamento via PIX (Brasil)',
            value: 'pix',
            emoji: '💵'
          }
        ])
        .setMaxValues(1)
    );
}

/**
 * Create the role selection embed
 */
function createRoleSelectEmbed() {
  return new EmbedBuilder()
    .setColor(0x3498DB)
    .setTitle('👤 Passo 2/4 - Seu Papel')
    .setDescription('```' +
      '┌────────────────────────────────────────┐\n' +
      '│  Você é o comprador ou o vendedor      │\n' +
      '│  nesta transação?                      │\n' +
      '└────────────────────────────────────────┘\n' +
      '```'
    )
    .setFooter({ text: 'Configuração de Intermediação' })
    .setTimestamp();
}

/**
 * Create the role select menu
 */
function createRoleSelectMenu() {
  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(WIZARD_IDS.ROLE_SELECT)
        .setPlaceholder('Selecione seu papel...')
        .addOptions([
          {
            label: 'Comprador',
            description: 'Estou comprando o produto/serviço',
            value: 'buyer',
            emoji: '🛒'
          },
          {
            label: 'Vendedor',
            description: 'Estou vendendo o produto/serviço',
            value: 'seller',
            emoji: '🎒'
          }
        ])
        .setMaxValues(1)
    );
}

/**
 * Create the amount modal (Step 3)
 */
function createAmountModal() {
  return new ModalBuilder()
    .setCustomId(WIZARD_IDS.AMOUNT_MODAL_SUBMIT)
    .setTitle('💰 Passo 3/4 - Valor da Transação')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('mm_amount')
          .setLabel('Valor da transação (ex: 150,00)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('150,00')
      )
    );
}

/**
 * Create the counterparty selection embed
 */
function createCounterpartySelectEmbed(userRole) {
  const roleLabel = userRole === 'buyer' ? 'Vendedor' : 'Comprador';
  const roleEmoji = userRole === 'buyer' ? '🎒' : '🛒';
  
  return new EmbedBuilder()
    .setColor(0x3498DB)
    .setTitle(roleEmoji + ' Passo 4/4 - Selecionar ' + roleLabel)
    .setDescription('```' +
      '┌────────────────────────────────────────┐\n' +
      '│  Selecione o ' + roleLabel.toLowerCase() + ' com quem você    │\n' +
      '│  está fazendo a trade.                 │\n' +
      '│                                        │\n' +
      '│  ⚠️ Você não pode selecionar a si      │\n' +
      '│  mesmo.                                │\n' +
      '└────────────────────────────────────────┘\n' +
      '```'
    )
    .setFooter({ text: 'Configuração de Intermediação' })
    .setTimestamp();
}

/**
 * Create the counterparty select menu (UserSelectMenu)
 */
function createCounterpartySelectMenu() {
  return new ActionRowBuilder()
    .addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(WIZARD_IDS.COUNTERPARTY_SELECT)
        .setPlaceholder('Selecione o usuário...')
        .setMaxValues(1)
    );
}

/**
 * Sanitize channel name
 */
function sanitizeChannelName(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90);
}

/**
 * Sanitize topic value
 */
function sanitizeTopicValue(value) {
  return value
    ? value.toString().replace(/\|/g, '/').replace(/[\r\n]/g, ' ').trim().slice(0, 200)
    : '';
}

/**
 * Format transaction amount
 */
function formatTransactionAmount(value) {
  if (!value) return 'N/A';
  const cleaned = value.toString().trim().replace(/[^0-9,\.]/g, '').replace(/\s+/g, ' ');
  return cleaned.startsWith('R$') ? cleaned : 'R$ ' + cleaned;
}

/**
 * Calculate MM fee (10% of transaction value)
 */
function calculateMMFee(amountDisplay) {
  if (!amountDisplay || amountDisplay === 'N/A') return 'R$ 0,00';
  
  let numericStr = amountDisplay.replace(/[^0-9,\.]/g, '').trim();
  
  if (numericStr.includes(',') && !numericStr.includes('.')) {
    numericStr = numericStr.replace(',', '.');
  }
  
  const value = parseFloat(numericStr);
  if (isNaN(value)) return 'R$ 0,00';
  
  const fee = value * 0.10;
  return 'R$ ' + fee.toFixed(2).replace('.', ',');
}

/**
 * Create the main ticket table embed
 */
function createTicketTableEmbed(data) {
  const { buyerDisplay, sellerDisplay, method, amountDisplay, statusDisplay, middlemanDisplay, mmFeeDisplay } = data;

  const feeDisplay = mmFeeDisplay || calculateMMFee(amountDisplay);

  let table = '```';
  table += '┌──────────────────────────────────────────┐\n';
  table += '│        DADOS DA INTERMEDIAÇÃO            │\n';
  table += '├──────────────────────────────────────────┤\n';
  table += '│ 💵 Método: ' + method.padEnd(29) + '│\n';
  table += '│ 💰 Valor:  ' + amountDisplay.padEnd(29) + '│\n';
  table += '│ 📊 Taxa MM:' + feeDisplay.padEnd(27) + '│\n';
  table += '│ 👤 Comprador: ' + buyerDisplay.padEnd(24) + '│\n';
  table += '│ 🎒 Vendedor:  ' + sellerDisplay.padEnd(24) + '│\n';
  table += '├──────────────────────────────────────────┤\n';
  table += '│ Status: ' + statusDisplay.padEnd(30) + '│\n';
  if (middlemanDisplay) {
    table += '│ 🛡️ Middleman: ' + middlemanDisplay.padEnd(25) + '│\n';
  } else {
    table += '│ 🛡️ Middleman: ' + 'Aguardando suporte'.padEnd(22) + '│\n';
  }
  table += '└──────────────────────────────────────────┘\n';
  table += '```';

  const statusColor = data.statusColor || 0x3498DB;

  const embed = new EmbedBuilder()
    .setColor(statusColor)
    .setTitle('🛡️ Intermediação Ativa')
    .setDescription(table)
    .setFooter({ text: 'ID: ' + Date.now().toString(36).toUpperCase() })
    .setTimestamp();

  return embed;
}

/**
 * Create the "Request Middleman" button
 */
function createRequestMMButton() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(WIZARD_IDS.REQUEST_MM)
        .setLabel('🚨 Solicitar Middleman')
        .setStyle(ButtonStyle.Primary)
    );
}

/**
 * Create the "Claim Intermediation" button
 */
function createClaimMMButton() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(WIZARD_IDS.CLAIM_MM)
        .setLabel('✋ Assumir Intermediação')
        .setStyle(ButtonStyle.Secondary)
    );
}

/**
 * Create the "Confirm Delivery" button
 */
function createConfirmDeliveryButton() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(WIZARD_IDS.CONFIRM_DELIVERY)
        .setLabel('📦 Confirmar Entrega')
        .setStyle(ButtonStyle.Success)
    );
}

/**
 * Create the "Finalize Intermediation" button
 */
function createFinalizeMMButton() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(WIZARD_IDS.FINALIZE_MM)
        .setLabel('🔒 Fechar Ticket')
        .setStyle(ButtonStyle.Danger)
    );
}

/**
 * Create the delivery confirmation modal
 */
function createConfirmDeliveryModal() {
  return new ModalBuilder()
    .setCustomId(WIZARD_IDS.CONFIRM_DELIVERY_MODAL)
    .setTitle('Confirmação de Recebimento')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('txt_confirmacao_entrega')
          .setLabel('Digite \'SIM\' para confirmar que recebeu o item:')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('SIM')
      )
    );
}

/**
 * Parse topic data from channel topic
 */
export function parseTopicData(topic) {
  if (!topic || !topic.startsWith('MM_DATA:')) {
    return null;
  }

  const dataStr = topic.replace('MM_DATA:', '');
  const data = {};

  dataStr.split('|').forEach(part => {
    const [key, value] = part.split('=');
    if (key && value !== undefined) {
      data[key] = value;
    }
  });

  return data;
}

/**
 * Serialize topic data for channel topic
 */
export function serializeTopicData(data) {
  const parts = Object.entries(data)
    .filter(([key, value]) => value !== undefined && value !== null)
    .map(([key, value]) => key + '=' + value);
  return 'MM_DATA:' + parts.join('|');
}

/**
 * Check if user is on cooldown
 */
function isOnCooldown(userId) {
  const lastAttempt = userCooldowns.get(userId);
  if (!lastAttempt) return false;
  
  const now = Date.now();
  return (now - lastAttempt) < COOLDOWN_MS;
}

/**
 * Check for existing active ticket for this buyer-seller pair
 */
async function findExistingTicket(guild, buyerId, sellerId) {
  // Get all channels in the MM category
  let mmCategory = null;
  if (mmConfig.mmCategoryId) {
    mmCategory = guild.channels.cache.get(mmConfig.mmCategoryId);
  }
  
  if (!mmCategory) {
    // Try to find the category by name
    mmCategory = guild.channels.cache.find(ch => 
      ch.type === ChannelType.GuildCategory && ch.name.includes('intermedia')
    );
  }
  
  if (!mmCategory) return null;
  
  // Check all channels in the category
  for (const [, channel] of mmCategory.children.cache) {
    if (channel.type !== ChannelType.GuildText) continue;
    
    const topic = channel.topic || '';
    const data = parseTopicData(topic);
    if (!data) continue;
    
    // Check if this channel involves the same buyer and seller
    const samePair = (
      (data.buyerId === buyerId && data.sellerId === sellerId) ||
      (data.buyerId === sellerId && data.sellerId === buyerId)
    );
    
    if (samePair && data.status !== 'COMPLETED') {
      return channel;
    }
  }
  
  return null;
}

/**
 * Handle the start button click
 */
export async function handleStart(interaction) {
  // CRITICAL: Defer immediately to prevent timeout
  await interaction.deferUpdate();

  const userId = interaction.user.id;

  // Check if user is already in a wizard
  if (usersInWizard.has(userId)) {
    return interaction.followUp({
      content: '❌ Você já está em um processo de intermediação. Complete ou cancele antes de iniciar outro.',
      ephemeral: true
    });
  }

  // Check cooldown
  if (isOnCooldown(userId)) {
    const lastAttempt = userCooldowns.get(userId);
    const remaining = Math.ceil((COOLDOWN_MS - (Date.now() - lastAttempt)) / 1000);
    return interaction.followUp({
      content: `⏳ Aguarde ${remaining} segundos antes de iniciar outra intermediação.`,
      ephemeral: true
    });
  }

  // Initialize wizard state
  wizardStates.set(userId, {
    step: 'payment',
    initiatorId: userId
  });

  // Mark user as in wizard
  usersInWizard.add(userId);

  // Show ephemeral message with payment selection
  await interaction.followUp({
    embeds: [createPaymentSelectEmbed()],
    components: [createPaymentSelectMenu()],
    ephemeral: true
  });
}

/**
 * Handle payment method selection
 */
export async function handlePaymentSelect(interaction) {
  await interaction.deferUpdate();

  const userId = interaction.user.id;
  const state = wizardStates.get(userId);
  
  if (!state) {
    usersInWizard.delete(userId);
    return interaction.followUp({
      content: '❌ Sessão expirada. Por favor, inicie novamente.',
      ephemeral: true
    });
  }

  const paymentMethod = interaction.values[0];
  state.paymentMethod = paymentMethod;
  state.step = 'role';

  await interaction.editReply({
    embeds: [createRoleSelectEmbed()],
    components: [createRoleSelectMenu()]
  });
}

/**
 * Handle role selection
 */
export async function handleRoleSelect(interaction) {
  const userId = interaction.user.id;
  const state = wizardStates.get(userId);
  
  if (!state) {
    usersInWizard.delete(userId);
    return interaction.followUp({
      content: '❌ Sessão expirada. Por favor, inicie novamente.',
      ephemeral: true
    });
  }

  const role = interaction.values[0];
  state.userRole = role;
  state.step = 'amount';

  const modal = createAmountModal();
  const modalShown = await safeShowModal(interaction, modal);
  if (!modalShown) {
    usersInWizard.delete(userId);
    return interaction.followUp({
      content: '❌ Não foi possível abrir o modal. Tente novamente.',
      ephemeral: true
    });
  }
}

/**
 * Handle amount modal submission
 */
export async function handleAmountModalSubmit(interaction) {
  const userId = interaction.user.id;
  const state = wizardStates.get(userId);
  
  if (!state) {
    usersInWizard.delete(userId);
    return interaction.reply({
      content: '❌ Sessão expirada. Por favor, inicie novamente.',
      ephemeral: true
    });
  }

  const rawAmount = interaction.fields.getTextInputValue('mm_amount').trim();
  const cleanedAmount = rawAmount.replace(/[^0-9,\.]/g, '').trim();

  if (!cleanedAmount) {
    return interaction.reply({
      content: '❌ Valor inválido. Por favor, insira um valor numérico válido.',
      ephemeral: true
    });
  }

  state.amount = formatTransactionAmount(cleanedAmount);
  state.step = 'counterparty';

  await interaction.reply({
    embeds: [createCounterpartySelectEmbed(state.userRole)],
    components: [createCounterpartySelectMenu()],
    ephemeral: true
  });
}

/**
 * Handle counterparty selection - CREATES THE CHANNEL HERE
 */
export async function handleCounterpartySelect(interaction) {
  await interaction.deferUpdate();

  const userId = interaction.user.id;
  const state = wizardStates.get(userId);
  
  if (!state) {
    usersInWizard.delete(userId);
    return interaction.followUp({
      content: '❌ Sessão expirada. Por favor, inicie novamente.',
      ephemeral: true
    });
  }

  const selectedUserId = interaction.values?.[0];
  if (!selectedUserId) {
    usersInWizard.delete(userId);
    return interaction.followUp({
      content: '❌ Você precisa selecionar um usuário.',
      ephemeral: true
    });
  }

  if (selectedUserId === userId) {
    usersInWizard.delete(userId);
    return interaction.followUp({
      content: '❌ Você não pode selecionar a si mesmo como contraparte!',
      ephemeral: true
    });
  }

  const selectedMember = await interaction.guild.members.fetch(selectedUserId).catch(() => null);
  if (!selectedMember) {
    usersInWizard.delete(userId);
    return interaction.followUp({
      content: '❌ Não foi possível encontrar o usuário selecionado.',
      ephemeral: true
    });
  }

  state.counterparty = selectedMember;
  state.step = 'complete';

  // Set cooldown BEFORE creating channel
  userCooldowns.set(userId, Date.now());

  try {
    await createTicketChannel(interaction, state);
  } finally {
    // Always clean up wizard state
    wizardStates.delete(userId);
    usersInWizard.delete(userId);
  }
}

/**
 * Create the private ticket channel (ONLY CALLED ONCE PER WIZARD)
 */
async function createTicketChannel(interaction, state) {
  try {
    const { userRole, counterparty, paymentMethod } = state;
    const initiator = interaction.member;

    // Determine buyer and seller
    const buyer = userRole === 'buyer' ? initiator : counterparty;
    const seller = userRole === 'seller' ? initiator : counterparty;

    // FIRST: Check for existing active ticket
    const existingTicket = await findExistingTicket(interaction.guild, buyer.id, seller.id);
    if (existingTicket) {
      return interaction.followUp({
        content: `⚠️ Já existe uma intermediação ativa entre ${buyer.user.username} e ${seller.user.username}.\nCanal: ${existingTicket.toString()}`,
        ephemeral: true
      });
    }

    // Get or create MM category
    let category;
    if (mmConfig.mmCategoryId) {
      category = interaction.guild.channels.cache.get(mmConfig.mmCategoryId);
    }

    if (!category || category.type !== ChannelType.GuildCategory) {
      category = await interaction.guild.channels.create({
        name: '🛡️・intermediações',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            deny: [PermissionFlagsBits.ViewChannel]
          }
        ]
      });
    }

    // Create unique channel name with timestamp to prevent collisions
    const sellerName = sanitizeChannelName(seller.user.username);
    const buyerName = sanitizeChannelName(buyer.user.username);
    const timestamp = Date.now().toString(36).slice(-4);
    const channelName = `mm-${sellerName}-e-${buyerName}-${timestamp}`;

    // Create the private channel
    const channel = await interaction.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: buyer.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AddReactions,
            PermissionFlagsBits.AttachFiles
          ]
        },
        {
          id: seller.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AddReactions,
            PermissionFlagsBits.AttachFiles
          ]
        },
        ...(mmConfig.staffRoleId ? [{
          id: mmConfig.staffRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.AddReactions,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ManageChannels
          ]
        }] : [])
      ]
    });

    // Set channel topic with MM data
    const topicData = serializeTopicData({
      buyerId: buyer.id,
      sellerId: seller.id,
      method: paymentMethod.toUpperCase(),
      amount: state.amount,
      status: 'PENDING'
    });
    await channel.setTopic(topicData);

    // Prepare data for the table
    const methodLabel = paymentMethod === 'pix' ? 'PIX' : paymentMethod.toUpperCase();
    const tableData = {
      buyerDisplay: buyer.user.username,
      sellerDisplay: seller.user.username,
      method: methodLabel,
      amountDisplay: state.amount || 'N/A',
      statusDisplay: mmConfig.statusLabels.PENDING,
      middlemanDisplay: null,
      statusColor: mmConfig.statusColors.PENDING
    };

    // Send the main table message and capture ID
    const tableMsg = await channel.send({
      embeds: [createTicketTableEmbed(tableData)],
      components: [createClaimMMButton()]
    });

    // Update topic with messageId
    const updatedTopicData = serializeTopicData({
      buyerId: buyer.id,
      sellerId: seller.id,
      method: paymentMethod.toUpperCase(),
      amount: state.amount,
      status: 'PENDING',
      tableMessageId: tableMsg.id
    });
    await channel.setTopic(updatedTopicData);

    // Send info message
    await channel.send({
      content: 
        '🛡️ **Intermediação Criada com Sucesso!**\n\n' +
        '• Comprador: ' + buyer.toString() + '\n' +
        '• Vendedor: ' + seller.toString() + '\n' +
        '• Método: ' + methodLabel + '\n\n' +
        'Clique em **"✋ Assumir Intermediação"** para um middleman chamar.'
    });

    // Send rules message
    await channel.send({
      content: '```' +
        '┌────────────────────────────────────────┐\n' +
        '│  ℹ️  INFORMAÇÕES IMPORTANTES            │\n' +
        '├────────────────────────────────────────┤\n' +
        '│ • Aguarde um middleman assumir         │\n' +
        '│ • Siga as instruções do middleman      │\n' +
        '│ • Nunca compartilhe dados pessoais      │\n' +
        '│ • Somente o middleman pode fechar      │\n' +
        '└────────────────────────────────────────┘\n' +
        '```'
    });

    // Auto-ping support/middleman when channel is created
    const supportRole = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === 'suporte');
    if (supportRole) {
      await channel.send({
        content: '🔔 <@&' + supportRole.id + '> Nova intermediação criada!\n' +
                 'Comprador: <@' + buyer.id + '> | Vendedor: <@' + seller.id + '>'
      });
    } else if (mmConfig.staffRoleId) {
      await channel.send({
        content: '🔔 <@&' + mmConfig.staffRoleId + '> Nova intermediação criada!\n' +
                 'Comprador: <@' + buyer.id + '> | Vendedor: <@' + seller.id + '>'
      });
    }

    // Notify the initiator
    await interaction.followUp({
      content: '✅ Intermediação criada com sucesso!\nCanal: ' + channel.toString(),
      ephemeral: true
    });

    logger.info('MM ticket created: ' + channel.name + ' | Buyer: ' + buyer.id + ' | Seller: ' + seller.id);

  } catch (error) {
    logger.error('Error creating MM ticket channel:', error);
    await interaction.followUp({
      content: '❌ Erro ao criar canal de intermediação. Tente novamente.',
      ephemeral: true
    });
  }
}

/**
 * Handle request middleman button
 */
export async function handleRequestMM(interaction) {
  await interaction.deferUpdate();

  const channel = interaction.channel;
  const topic = channel.topic || '';

  const data = parseTopicData(topic);
  if (!data) {
    return interaction.followUp({
      content: '❌ Dados da intermediação inválidos.',
      ephemeral: true
    });
  }

  // Update status to NOTIFIED
  data.status = 'NOTIFIED';
  await channel.setTopic(serializeTopicData(data));

  // Fetch usernames
  let buyerName = 'Unknown';
  let sellerName = 'Unknown';
  try {
    const buyerMember = await interaction.guild.members.fetch(data.buyerId);
    if (buyerMember) buyerName = buyerMember.user.username;
  } catch { /* ignore */ }
  try {
    const sellerMember = await interaction.guild.members.fetch(data.sellerId);
    if (sellerMember) sellerName = sellerMember.user.username;
  } catch { /* ignore */ }

  const tableData = {
    buyerDisplay: buyerName,
    sellerDisplay: sellerName,
    method: data.method,
    amountDisplay: data.amount || 'N/A',
    statusDisplay: mmConfig.statusLabels.NOTIFIED,
    middlemanDisplay: null,
    statusColor: mmConfig.statusColors.NOTIFIED
  };

  if (data.tableMessageId) {
    try {
      const tableMessage = await channel.messages.fetch(data.tableMessageId);
      if (tableMessage) {
        await tableMessage.edit({
          embeds: [createTicketTableEmbed(tableData)],
          components: [createClaimMMButton()]
        });
      }
    } catch (err) {
      logger.warn('Failed to update table message', { error: err.message });
    }
  }

  // Ping the staff role
  const supportRole = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === 'suporte');
  const roleToPing = supportRole?.id || mmConfig.staffRoleId;
  
  if (roleToPing) {
    await channel.send({
      content: '🚨 <@&' + roleToPing + '> Intermediação solicitada!\n' +
               'Comprador: <@' + data.buyerId + '> | Vendedor: <@' + data.sellerId + '>'
    });
  } else {
    logger.warn('No staff role found to ping for MM request', { channelId: channel.id });
  }

  await interaction.followUp({
    content: '✅ Middleman notificado. Aguarde alguém assumir.',
    ephemeral: true
  });
}

/**
 * Check if a member is staff
 */
export async function isUserStaff(member, guild) {
  if (member.id === guild.ownerId) {
    return true;
  }

  const supportRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'suporte');
  if (supportRole && member.roles.cache.has(supportRole.id)) {
    return true;
  }

  if (mmConfig.staffRoleId && member.roles.cache.has(mmConfig.staffRoleId)) {
    return true;
  }

  return false;
}

/**
 * Handle claim middleman button
 */
export async function handleClaimMM(interaction) {
  const channel = interaction.channel;
  const channelId = channel.id;
  const topic = channel.topic || '';
  const data = parseTopicData(topic);

  if (!data) {
    return interaction.reply({
      content: '❌ Dados da intermediação inválidos.',
      ephemeral: true
    });
  }

  // CRITICAL: Defer immediately
  await interaction.deferUpdate();

  // Check if already being claimed
  if (claimingChannels.has(channelId)) {
    return interaction.followUp({
      content: '⏳ Alguém já está assumindo esta intermediação. Aguarde um instante...',
      ephemeral: true
    });
  }

  // Check if already claimed
  if (data.mmId) {
    return interaction.followUp({
      content: 'ℹ️ Esta intermediação já foi assumida por <@' + data.mmId + '>.',
      ephemeral: true
    });
  }

  // Check if user is trying to assume their own ticket
  if (data.buyerId === interaction.user.id || data.sellerId === interaction.user.id) {
    return interaction.followUp({
      content: '❌ Você não pode assumir sua própria intermediação.',
      ephemeral: true
    });
  }

  // Mark channel as being claimed
  claimingChannels.add(channelId);
  
  const timeoutHandle = setTimeout(() => {
    claimingChannels.delete(channelId);
  }, claimTimeout);

  try {
    // Check staff permissions
    const member = interaction.guild.members.cache.get(interaction.user.id)
      || await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) {
      return interaction.followUp({
        content: '❌ Erro ao verificar permissões.',
        ephemeral: true
      });
    }

    const isStaff = await isUserStaff(member, interaction.guild);
    if (!isStaff) {
      return interaction.followUp({
        content: '❌ Apenas membros da equipe com o cargo "Suporte" podem assumir esta intermediação.',
        ephemeral: true
      });
    }

    // Double-check race condition
    const freshData = parseTopicData(channel.topic || '');
    if (!freshData) {
      return interaction.followUp({
        content: '❌ Dados da intermediação inválidos.',
        ephemeral: true
      });
    }
    if (freshData.mmId) {
      return interaction.followUp({
        content: 'ℹ️ Esta intermediação já foi assumida por <@' + freshData.mmId + '>.',
        ephemeral: true
      });
    }

    // Send loading message
    await channel.send({
      content: '⏳ **Alguém está assumindo a intermediação...**\nAguarde um instante, comprador e vendedor.'
    });

    // Update data
    const updateData = { ...freshData };
    updateData.mmId = interaction.user.id;
    updateData.status = 'IN_PROGRESS';
    
    try {
      await channel.setTopic(serializeTopicData(updateData));
    } catch (err) {
      logger.warn('Failed to update channel topic during claim', { error: err.message });
    }

    // Get member names
    const [buyerMember, sellerMember] = await Promise.all([
      interaction.guild.members.cache.get(updateData.buyerId)
        || interaction.guild.members.fetch(updateData.buyerId).catch(() => null),
      interaction.guild.members.cache.get(updateData.sellerId)
        || interaction.guild.members.fetch(updateData.sellerId).catch(() => null)
    ]);

    const buyerName = buyerMember?.user.username || 'Unknown';
    const sellerName = sellerMember?.user.username || 'Unknown';

    const tableData = {
      buyerDisplay: buyerName,
      sellerDisplay: sellerName,
      method: updateData.method,
      amountDisplay: updateData.amount || 'N/A',
      statusDisplay: mmConfig.statusLabels.IN_PROGRESS,
      middlemanDisplay: interaction.user.username,
      statusColor: mmConfig.statusColors.IN_PROGRESS
    };

    // Update the table message
    if (updateData.tableMessageId) {
      try {
        const tableMessage = await channel.messages.fetch(updateData.tableMessageId);
        if (tableMessage) {
          await tableMessage.edit({
            embeds: [createTicketTableEmbed(tableData)],
            components: [createConfirmDeliveryButton()]
          });
        }
      } catch (err) {
        logger.warn('Failed to update table message', { error: err.message });
      }
    }

    // Send success message
    await channel.send({
      content: '✅ O Middleman **' + interaction.user.username + '** assumiu a intermediação.\n' +
               'Vendedor e Comprador podem prosseguir de forma segura.'
    });

    await interaction.followUp({
      content: '✅ Intermediação assumida com sucesso!',
      ephemeral: true
    });

  } finally {
    clearTimeout(timeoutHandle);
    claimingChannels.delete(channelId);
  }
}

/**
 * Handle confirm delivery button
 */
export async function handleConfirmDelivery(interaction) {
  const channel = interaction.channel;
  const topic = channel.topic || '';
  const data = parseTopicData(topic);

  if (!data) {
    return interaction.reply({
      content: '❌ Dados da intermediação inválidos.',
      ephemeral: true
    });
  }

  // Only the buyer can confirm delivery
  if (data.buyerId !== interaction.user.id) {
    return interaction.reply({
      content: '❌ Apenas o Comprador pode confirmar o recebimento do item.',
      ephemeral: true
    });
  }

  // Show the confirmation modal
  const modal = createConfirmDeliveryModal();
  const modalShown = await safeShowModal(interaction, modal);
  if (!modalShown) {
    return interaction.reply({
      content: '❌ Não foi possível abrir o modal. Tente novamente.',
      ephemeral: true
    });
  }
}

/**
 * Handle delivery confirmation modal submission
 */
export async function handleConfirmDeliveryModal(interaction) {
  const channel = interaction.channel;
  const topic = channel.topic || '';
  const data = parseTopicData(topic);

  if (!data) {
    return interaction.reply({
      content: '❌ Dados da intermediação inválidos.',
      ephemeral: true
    });
  }

  // Only the buyer can submit this modal
  if (data.buyerId !== interaction.user.id) {
    return interaction.reply({
      content: '❌ Apenas o Comprador pode confirmar o recebimento.',
      ephemeral: true
    });
  }

  // Get the input and validate
  const confirmationInput = interaction.fields.getTextInputValue('txt_confirmacao_entrega')
    .trim()
    .toLowerCase();

  if (confirmationInput !== 'sim') {
    return interaction.reply({
      content: '❌ Confirmação recusada. Você precisa digitar exatamente \'SIM\' para prosseguir.',
      ephemeral: true
    });
  }

  // Defer after validation
  await interaction.deferUpdate();

  try {
    // Update status to DELIVERED
    data.status = 'DELIVERED';
    await channel.setTopic(serializeTopicData(data));

    // Fetch usernames
    let buyerName = 'Unknown';
    let sellerName = 'Unknown';
    let middlemanName = null;
    
    try {
      const buyerMember = interaction.guild.members.cache.get(data.buyerId)
        || await interaction.guild.members.fetch(data.buyerId).catch(() => null);
      if (buyerMember) buyerName = buyerMember.user.username;
    } catch { /* ignore */ }
    
    try {
      const sellerMember = interaction.guild.members.cache.get(data.sellerId)
        || await interaction.guild.members.fetch(data.sellerId).catch(() => null);
      if (sellerMember) sellerName = sellerMember.user.username;
    } catch { /* ignore */ }
    
    try {
      if (data.mmId) {
        const mmMember = interaction.guild.members.cache.get(data.mmId)
          || await interaction.guild.members.fetch(data.mmId).catch(() => null);
        if (mmMember) middlemanName = mmMember.user.username;
      }
    } catch { /* ignore */ }

    // Update embed
    const tableData = {
      buyerDisplay: buyerName,
      sellerDisplay: sellerName,
      method: data.method,
      amountDisplay: data.amount || 'N/A',
      statusDisplay: mmConfig.statusLabels.DELIVERED,
      middlemanDisplay: middlemanName,
      statusColor: mmConfig.statusColors.DELIVERED
    };

    if (data.tableMessageId) {
      try {
        const tableMessage = await channel.messages.fetch(data.tableMessageId);
        if (tableMessage) {
          await tableMessage.edit({
            embeds: [createTicketTableEmbed(tableData)],
            components: [createFinalizeMMButton()]
          });
        }
      } catch (err) {
        logger.warn('Failed to update table message', { error: err.message });
      }
    }

    // Send notification
    await channel.send({
      content: '✅ O Comprador **' + interaction.user.username + '** confirmou o recebimento do item.\n' +
               'Middleman pode agora finalizar a intermediação.'
    });

    await interaction.followUp({
      content: '✅ Recebimento confirmado com sucesso!',
      ephemeral: true
    });
  } catch (error) {
    logger.error('Error in confirm delivery modal:', { error: error.message });
    await interaction.followUp({
      content: '❌ Erro ao processar confirmação. Tente novamente.',
      ephemeral: true
    });
  }
}

/**
 * Handle finalize intermediation button (MM only or Admin)
 */
export async function handleFinalizeMM(interaction) {
  await interaction.deferUpdate();

  const channel = interaction.channel;
  const topic = channel.topic || '';
  const data = parseTopicData(topic);

  if (!data) {
    return interaction.followUp({
      content: '❌ Dados da intermediação inválidos.',
      ephemeral: true
    });
  }

  // PERMISSION CHECK
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    return interaction.followUp({
      content: '❌ Erro ao verificar permissões.',
      ephemeral: true
    });
  }

  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
  const isAssignedMM = data.mmId === interaction.user.id;

  if (!isAssignedMM && !isAdmin) {
    const isBuyer = data.buyerId === interaction.user.id;
    const isSeller = data.sellerId === interaction.user.id;
    
    if (isBuyer || isSeller) {
      return interaction.followUp({
        content: '❌ Apenas o Middleman pode fechar o ticket.',
        ephemeral: true
      });
    }
    
    return interaction.followUp({
      content: '❌ Apenas o Middleman responsável ou um Administrador pode finalizar esta intermediação.',
      ephemeral: true
    });
  }

  // Update data
  data.status = 'COMPLETED';
  await channel.setTopic(serializeTopicData(data));

  // Fetch usernames
  let buyerName = 'Unknown';
  let sellerName = 'Unknown';
  try {
    const buyerMember = await interaction.guild.members.fetch(data.buyerId);
    if (buyerMember) buyerName = buyerMember.user.username;
  } catch { /* ignore */ }
  try {
    const sellerMember = await interaction.guild.members.fetch(data.sellerId);
    if (sellerMember) sellerName = sellerMember.user.username;
  } catch { /* ignore */ }

  // Update embed
  const tableData = {
    buyerDisplay: buyerName,
    sellerDisplay: sellerName,
    method: data.method,
    amountDisplay: data.amount || 'N/A',
    statusDisplay: mmConfig.statusLabels.COMPLETED,
    middlemanDisplay: interaction.user.username,
    statusColor: mmConfig.statusColors.COMPLETED
  };

  if (data.tableMessageId) {
    try {
      const tableMessage = await channel.messages.fetch(data.tableMessageId);
      if (tableMessage) {
        await tableMessage.edit({
          embeds: [createTicketTableEmbed(tableData)],
          components: []
        });
      }
    } catch (err) {
      logger.warn('Failed to update table message', { error: err.message });
    }
  }

  // Send final message with countdown
  const countdownMsg = await channel.send({
    content: '🔒 **Intermediação Concluída**\n' +
             'Finalizada por: ' + interaction.user.toString() + '\n\n' +
             '⚠️ Este canal será deletado em **5 segundos**...'
  });

  // Countdown
  for (let i = 4; i >= 1; i--) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    try {
      await countdownMsg.edit({
        content: '🔒 **Intermediação Concluída**\n' +
                 'Finalizada por: ' + interaction.user.toString() + '\n\n' +
                 '⚠️ Este canal será deletado em **' + i + ' segundos**...'
      });
    } catch { /* ignore */ }
  }

  await interaction.followUp({
    content: '✅ Intermediação concluída com sucesso!',
    ephemeral: true
  });

  // Delete channel
  if (channel.deletable) {
    await channel.delete();
  }
}

/**
 * Handle close ticket via command button
 */
export async function handleCloseTicketCommand(interaction) {
  await interaction.deferUpdate();

  const channel = interaction.channel;
  const topic = channel.topic || '';
  const data = parseTopicData(topic);

  if (!data) {
    return interaction.followUp({
      content: '❌ Dados da intermediação inválidos.',
      ephemeral: true
    });
  }

  // Only the assigned middleman can close
  if (data.mmId !== interaction.user.id) {
    return interaction.followUp({
      content: '❌ Apenas o MM responsável pode fechar este ticket.',
      ephemeral: true
    });
  }

  // Update data
  data.status = 'COMPLETED';
  await channel.setTopic(serializeTopicData(data));

  // Fetch usernames
  let buyerName = 'Unknown';
  let sellerName = 'Unknown';
  try {
    const buyerMember = await interaction.guild.members.fetch(data.buyerId);
    if (buyerMember) buyerName = buyerMember.user.username;
  } catch { /* ignore */ }
  try {
    const sellerMember = await interaction.guild.members.fetch(data.sellerId);
    if (sellerMember) sellerName = sellerMember.user.username;
  } catch { /* ignore */ }

  // Update embed
  const tableData = {
    buyerDisplay: buyerName,
    sellerDisplay: sellerName,
    method: data.method,
    amountDisplay: data.amount || 'N/A',
    statusDisplay: mmConfig.statusLabels.COMPLETED,
    middlemanDisplay: interaction.user.username,
    statusColor: mmConfig.statusColors.COMPLETED
  };

  if (data.tableMessageId) {
    try {
      const tableMessage = await channel.messages.fetch(data.tableMessageId);
      if (tableMessage) {
        await tableMessage.edit({
          embeds: [createTicketTableEmbed(tableData)],
          components: []
        });
      }
    } catch (err) {
      logger.warn('Failed to update table message', { error: err.message });
    }
  }

  // Send final message with countdown
  const countdownMsg = await channel.send({
    content: '🔒 **Intermediação Concluída**\n' +
             'Fechada por comando de: ' + interaction.user.toString() + '\n\n' +
             '⚠️ Este canal será deletado em **5 segundos**...'
  });

  // Countdown
  for (let i = 4; i >= 1; i--) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    try {
      await countdownMsg.edit({
        content: '🔒 **Intermediação Concluída**\n' +
                 'Fechada por comando de: ' + interaction.user.toString() + '\n\n' +
                 '⚠️ Este canal será deletado em **' + i + ' segundos**...'
      });
    } catch { /* ignore */ }
  }

  await interaction.followUp({
    content: '✅ Intermediação concluída com sucesso!',
    ephemeral: true
  });

  // Delete channel
  if (channel.deletable) {
    await channel.delete();
  }
}

/**
 * Handle close intermediation button
 */
export async function handleCloseMM(interaction) {
  await interaction.deferUpdate();

  const channel = interaction.channel;
  const topic = channel.topic || '';
  const data = parseTopicData(topic);

  if (!data) {
    return interaction.followUp({
      content: '❌ Dados da intermediação inválidos.',
      ephemeral: true
    });
  }

  // Only the assigned middleman can close
  if (data.mmId !== interaction.user.id) {
    return interaction.followUp({
      content: '❌ Apenas o middleman responsável pode fechar esta intermediação.',
      ephemeral: true
    });
  }

  // Update data
  data.status = 'COMPLETED';
  await channel.setTopic(serializeTopicData(data));

  // Fetch usernames
  let buyerName = 'Unknown';
  let sellerName = 'Unknown';
  try {
    const buyerMember = await interaction.guild.members.fetch(data.buyerId);
    if (buyerMember) buyerName = buyerMember.user.username;
  } catch { /* ignore */ }
  try {
    const sellerMember = await interaction.guild.members.fetch(data.sellerId);
    if (sellerMember) sellerName = sellerMember.user.username;
  } catch { /* ignore */ }

  // Update embed
  const tableData = {
    buyerDisplay: buyerName,
    sellerDisplay: sellerName,
    method: data.method,
    amountDisplay: data.amount || 'N/A',
    statusDisplay: mmConfig.statusLabels.COMPLETED,
    middlemanDisplay: interaction.user.username,
    statusColor: mmConfig.statusColors.COMPLETED
  };

  if (data.tableMessageId) {
    try {
      const tableMessage = await channel.messages.fetch(data.tableMessageId);
      if (tableMessage) {
        await tableMessage.edit({
          embeds: [createTicketTableEmbed(tableData)],
          components: []
        });
      }
    } catch (err) {
      logger.warn('Failed to update table message', { error: err.message });
    }
  }

  // Send final message with countdown
  const countdownMsg = await channel.send({
    content: '🔒 **Intermediação Concluída**\n' +
             'Fechada por: ' + interaction.user.toString() + '\n\n' +
             '⚠️ Este canal será deletado em **5 segundos**...'
  });

  // Countdown
  for (let i = 4; i >= 1; i--) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    try {
      await countdownMsg.edit({
        content: '🔒 **Intermediação Concluída**\n' +
                 'Fechada por: ' + interaction.user.toString() + '\n\n' +
                 '⚠️ Este canal será deletado em **' + i + ' segundos**...'
      });
    } catch { /* ignore */ }
  }

  await interaction.followUp({
    content: '✅ Intermediação concluída com sucesso!',
    ephemeral: true
  });

  // Delete channel
  if (channel.deletable) {
    await channel.delete();
  }
}

export default {
  wizardIds: WIZARD_IDS,
  handleStart,
  handlePaymentSelect,
  handleRoleSelect,
  handleAmountModalSubmit,
  handleCounterpartySelect,
  handleRequestMM,
  handleClaimMM,
  handleConfirmDelivery,
  handleConfirmDeliveryModal,
  handleFinalizeMM,
  handleCloseTicketCommand,
  handleCloseMM,
  parseTopicData,
  serializeTopicData,
  isUserStaff
};