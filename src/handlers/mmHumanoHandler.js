/**
 * Middleman Humano Handler - Sistema Sem Banco de Dados (VERSÃO CORRIGIDA v2)
 * 
 * CORREÇÕES APLICADAS:
 * - Prevenção de criação duplicada de canais
 * - Sistema de locking para evitar race conditions
 * - Validação de canal existente antes de criar
 * - Cooldown entre tentativas
 * - Removido botão "Confirmar Entrega" do comprador
 * - Adicionados botões "Concluir Ticket" e "Cancelar Ticket" apenas para MM
 * - Otimizado handleClaimMM para evitar demora de 10 minutos
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
  COMPLETE_TICKET: 'mm_complete_ticket',
  CANCEL_TICKET: 'mm_cancel_ticket',
  CANCEL_REASON_MODAL: 'mm_cancel_reason_modal',
  CLOSE_MM: 'mm_close_intermediacao',
  CLOSE_TICKET_COMMAND: 'mm_close_ticket_cmd'
};

// Wizard state stored in memory (per user, temporary)
const wizardStates = new Map();

// Track users currently in the wizard to prevent duplicate starts
const usersInWizard = new Set();

// Track channels being claimed to prevent race conditions
const claimingChannels = new Set();
const claimTimeout = 3000; // 3 seconds timeout (reduced from 15s)

// Cooldown map to prevent spam
const userCooldowns = new Map();
const COOLDOWN_MS = 30000; // 30 seconds cooldown

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
 * Create the counterparty select menu
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
 * Create the MM action buttons (Complete + Cancel)
 */
function createMMActionButtons() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(WIZARD_IDS.COMPLETE_TICKET)
        .setLabel('✅ Concluir Ticket')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(WIZARD_IDS.CANCEL_TICKET)
        .setLabel('❌ Cancelar Ticket')
        .setStyle(ButtonStyle.Danger)
    );
}

/**
 * Create the cancel reason modal
 */
function createCancelReasonModal() {
  return new ModalBuilder()
    .setCustomId(WIZARD_IDS.CANCEL_REASON_MODAL)
    .setTitle('Motivo do Cancelamento')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('cancel_reason')
          .setLabel('Explique o motivo do cancelamento:')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setPlaceholder('Descreva o motivo do cancelamento...')
          .setMaxLength(500)
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
  let mmCategory = null;
  if (mmConfig.mmCategoryId) {
    mmCategory = guild.channels.cache.get(mmConfig.mmCategoryId);
  }
  
  if (!mmCategory) {
    mmCategory = guild.channels.cache.find(ch => 
      ch.type === ChannelType.GuildCategory && ch.name.includes('intermedia')
    );
  }
  
  if (!mmCategory) return null;
  
  for (const [, channel] of mmCategory.children.cache) {
    if (channel.type !== ChannelType.GuildText) continue;
    
    const topic = channel.topic || '';
    const data = parseTopicData(topic);
    if (!data) continue;
    
    const samePair = (
      (data.buyerId === buyerId && data.sellerId === sellerId) ||
      (data.buyerId === sellerId && data.sellerId === buyerId)
    );
    
    if (samePair && data.status !== 'COMPLETED' && data.status !== 'CANCELLED') {
      return channel;
    }
  }
  
  return null;
}

/**
 * Handle the start button click
 */
export async function handleStart(interaction) {
  await interaction.deferUpdate();

  const userId = interaction.user.id;

  if (usersInWizard.has(userId)) {
    return interaction.followUp({
      content: '❌ Você já está em um processo de intermediação. Complete ou cancele antes de iniciar outro.',
      ephemeral: true
    });
  }

  if (isOnCooldown(userId)) {
    const lastAttempt = userCooldowns.get(userId);
    const remaining = Math.ceil((COOLDOWN_MS - (Date.now() - lastAttempt)) / 1000);
    return interaction.followUp({
      content: `⏳ Aguarde ${remaining} segundos antes de iniciar outra intermediação.`,
      ephemeral: true
    });
  }

  wizardStates.set(userId, {
    step: 'payment',
    initiatorId: userId
  });

  usersInWizard.add(userId);

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
 * Handle counterparty selection
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

  userCooldowns.set(userId, Date.now());

  try {
    await createTicketChannel(interaction, state);
  } finally {
    wizardStates.delete(userId);
    usersInWizard.delete(userId);
  }
}

/**
 * Create the private ticket channel
 */
async function createTicketChannel(interaction, state) {
  try {
    const { userRole, counterparty, paymentMethod } = state;
    const initiator = interaction.member;

    const buyer = userRole === 'buyer' ? initiator : counterparty;
    const seller = userRole === 'seller' ? initiator : counterparty;

    // Check for existing active ticket
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

    const sellerName = sanitizeChannelName(seller.user.username);
    const buyerName = sanitizeChannelName(buyer.user.username);
    const timestamp = Date.now().toString(36).slice(-4);
    const channelName = `mm-${sellerName}-e-${buyerName}-${timestamp}`;

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

    const topicData = serializeTopicData({
      buyerId: buyer.id,
      sellerId: seller.id,
      method: paymentMethod.toUpperCase(),
      amount: state.amount,
      status: 'PENDING'
    });
    await channel.setTopic(topicData);

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

    const tableMsg = await channel.send({
      embeds: [createTicketTableEmbed(tableData)],
      components: [createClaimMMButton()]
    });

    const updatedTopicData = serializeTopicData({
      buyerId: buyer.id,
      sellerId: seller.id,
      method: paymentMethod.toUpperCase(),
      amount: state.amount,
      status: 'PENDING',
      tableMessageId: tableMsg.id
    });
    await channel.setTopic(updatedTopicData);

    await channel.send({
      content: 
        '🛡️ **Intermediação Criada com Sucesso!**\n\n' +
        '• Comprador: ' + buyer.toString() + '\n' +
        '• Vendedor: ' + seller.toString() + '\n' +
        '• Método: ' + methodLabel + '\n\n' +
        'Aguarde um middleman assumir a intermediação.'
    });

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

  data.status = 'NOTIFIED';
  await channel.setTopic(serializeTopicData(data));

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

// IDs dos cargos que podem concluir/cancelar tickets (Suporte e Middleman)
const MM_ALLOWED_ROLE_IDS = ['1505631589407658064', '1505618270492033094'];

/**
 * Verifica se o membro pode agir como MM no ticket.
 * Retorna true se for o MM responsável pelo ticket OU se tiver cargo de Suporte/Middleman.
 */
async function canActAsMMOnTicket(interaction, data) {
  // É o MM responsável pelo ticket
  if (data.mmId && data.mmId === interaction.user.id) {
    return true;
  }

  // Tem cargo de Suporte ou Middleman
  const member = interaction.guild.members.cache.get(interaction.user.id)
    ?? await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

  if (!member) return false;

  // Owner sempre pode
  if (member.id === interaction.guild.ownerId) return true;

  return MM_ALLOWED_ROLE_IDS.some(roleId => member.roles.cache.has(roleId));
}

/**
 * Handle claim middleman button - OTIMIZADO PARA EVITAR DEMORA
 *
 * Correções aplicadas (v3):
 * - Fix #1: deferUpdate() movido para o TOPO — ACK imediato evita expiração da interação em 3s
 * - Fix #2: setTopic() protegido por Promise.race com timeout de 5s — evita travar por rate limit
 * - Fix #3: claimTimeout agora usado como safety timer para auto-limpar o Set em caso de falha
 * - Fix #4: member.fetch() como fallback quando cache miss
 */
export async function handleClaimMM(interaction) {
  const channel = interaction.channel;
  const channelId = channel.id;

  // Fix #1: ACK imediato — o Discord exige resposta em ~3 segundos.
  // Fazer qualquer await antes disso arrisca expirar a interação.
  await interaction.deferUpdate();

  const topic = channel.topic || '';
  const data = parseTopicData(topic);

  if (!data) {
    return interaction.followUp({
      content: '❌ Dados da intermediação inválidos.',
      ephemeral: true
    });
  }

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

  // Fix #4: fallback para fetch() caso o membro não esteja no cache
  const member = interaction.guild.members.cache.get(interaction.user.id)
    ?? await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

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

  // Fix #3: safety timer que auto-limpa o Set caso o finally não execute
  claimingChannels.add(channelId);
  const safetyTimer = setTimeout(() => claimingChannels.delete(channelId), claimTimeout);

  try {
    // Double-check race condition (re-lê o topic para pegar estado mais recente)
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

    // Update data
    const updateData = { ...freshData };
    updateData.mmId = interaction.user.id;
    updateData.status = 'IN_PROGRESS';

    // Fix #2: setTopic() com timeout de 5s via Promise.race.
    // O Discord pode segurar o request por até 10 minutos em rate limit de channel edit.
    // Com o race, o claim visual acontece imediatamente mesmo se a persistência atrasar.
    try {
      await Promise.race([
        channel.setTopic(serializeTopicData(updateData)),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('setTopic timeout após 5s')), 5000)
        )
      ]);
    } catch (err) {
      logger.warn('setTopic falhou ou atingiu timeout durante claim (continuando sem persistência imediata)', {
        error: err.message,
        channelId
      });
    }

    // Get member names from cache only (faster)
    const buyerMember = interaction.guild.members.cache.get(updateData.buyerId);
    const sellerMember = interaction.guild.members.cache.get(updateData.sellerId);

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

    // Update the table message with MM action buttons
    if (updateData.tableMessageId) {
      try {
        const tableMessage = await channel.messages.fetch(updateData.tableMessageId);
        if (tableMessage) {
          await tableMessage.edit({
            embeds: [createTicketTableEmbed(tableData)],
            components: [createMMActionButtons()]
          });
        }
      } catch (err) {
        logger.warn('Failed to update table message', { error: err.message });
      }
    }

    // Send success message
    await channel.send({
      content: '✅ O Middleman **' + interaction.user.username + '** assumiu a intermediação.\n' +
               'Agora siga as instruções do middleman para concluir a trade.'
    });

    await interaction.followUp({
      content: '✅ Intermediação assumida com sucesso!\n\n' +
               '📋 **Ações disponíveis:**\n' +
               '✅ **Concluir Ticket** - Finaliza a intermediação com sucesso\n' +
               '❌ **Cancelar Ticket** - Cancela a intermediação (requer justificativa)',
      ephemeral: true
    });

  } finally {
    clearTimeout(safetyTimer);
    claimingChannels.delete(channelId);
  }
}

/**
 * Handle complete ticket button (MM only)
 */
export async function handleCompleteTicket(interaction) {
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

  // MM responsável ou cargo de Suporte/Middleman pode concluir
  const canComplete = await canActAsMMOnTicket(interaction, data);
  if (!canComplete) {
    return interaction.followUp({
      content: '❌ Apenas o Middleman responsável pode concluir esta intermediação.',
      ephemeral: true
    });
  }

  // Update status
  data.status = 'COMPLETED';
  await channel.setTopic(serializeTopicData(data));

  // Fetch usernames from cache
  const buyerMember = interaction.guild.members.cache.get(data.buyerId);
  const sellerMember = interaction.guild.members.cache.get(data.sellerId);
  const buyerName = buyerMember?.user.username || 'Unknown';
  const sellerName = sellerMember?.user.username || 'Unknown';

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

  // Send final message
  await channel.send({
    content: '✅ **Intermediação Concluída com Sucesso!**\n' +
             'Finalizada por: ' + interaction.user.toString() + '\n\n' +
             'Obrigado por usar nosso serviço de intermediação!'
  });

  await interaction.followUp({
    content: '✅ Intermediação concluída com sucesso!',
    ephemeral: true
  });

  // Delete channel after a short delay
  await new Promise(resolve => setTimeout(resolve, 3000));
  if (channel.deletable) {
    await channel.delete();
  }
}

/**
 * Handle cancel ticket button (MM only)
 */
export async function handleCancelTicket(interaction) {
  const channel = interaction.channel;
  const topic = channel.topic || '';
  const data = parseTopicData(topic);

  if (!data) {
    return interaction.reply({
      content: '❌ Dados da intermediação inválidos.',
      ephemeral: true
    });
  }

  // MM responsável ou cargo de Suporte/Middleman pode cancelar
  const canCancel = await canActAsMMOnTicket(interaction, data);
  if (!canCancel) {
    return interaction.reply({
      content: '❌ Apenas o Middleman responsável pode cancelar esta intermediação.',
      ephemeral: true
    });
  }

  // Show cancel reason modal
  const modal = createCancelReasonModal();
  const modalShown = await safeShowModal(interaction, modal);
  if (!modalShown) {
    return interaction.reply({
      content: '❌ Não foi possível abrir o modal. Tente novamente.',
      ephemeral: true
    });
  }
}

/**
 * Handle cancel reason modal submission
 */
export async function handleCancelReasonModal(interaction) {
  const channel = interaction.channel;
  const topic = channel.topic || '';
  const data = parseTopicData(topic);

  if (!data) {
    return interaction.reply({
      content: '❌ Dados da intermediação inválidos.',
      ephemeral: true
    });
  }

  // Only the assigned MM can cancel
  if (data.mmId !== interaction.user.id) {
    return interaction.reply({
      content: '❌ Apenas o Middleman responsável pode cancelar esta intermediação.',
      ephemeral: true
    });
  }

  const reason = interaction.fields.getTextInputValue('cancel_reason').trim();
  
  if (!reason) {
    return interaction.reply({
      content: '❌ É necessário fornecer um motivo para o cancelamento.',
      ephemeral: true
    });
  }

  await interaction.deferUpdate();

  // Update status
  data.status = 'CANCELLED';
  data.cancelReason = reason;
  data.cancelledBy = interaction.user.id;
  await channel.setTopic(serializeTopicData(data));

  // Fetch usernames from cache
  const buyerMember = interaction.guild.members.cache.get(data.buyerId);
  const sellerMember = interaction.guild.members.cache.get(data.sellerId);
  const buyerName = buyerMember?.user.username || 'Unknown';
  const sellerName = sellerMember?.user.username || 'Unknown';

  // Update embed
  const tableData = {
    buyerDisplay: buyerName,
    sellerDisplay: sellerName,
    method: data.method,
    amountDisplay: data.amount || 'N/A',
    statusDisplay: mmConfig.statusLabels.CANCELLED,
    middlemanDisplay: interaction.user.username,
    statusColor: mmConfig.statusColors.CANCELLED
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

  // Send cancellation message with reason
  await channel.send({
    content: '❌ **Intermediação Cancelada**\n' +
             'Cancelada por: ' + interaction.user.toString() + '\n\n' +
             '📝 **Motivo:**\n' +
             '```' + reason + '```'
  });

  await interaction.followUp({
    content: '✅ Intermediação cancelada com sucesso.',
    ephemeral: true
  });

  // Delete channel after a short delay
  await new Promise(resolve => setTimeout(resolve, 5000));
  if (channel.deletable) {
    await channel.delete();
  }
}

/**
 * Handle close intermediation button (legacy)
 */
export async function handleCloseMM(interaction) {
  await interaction.deferUpdate();
  // Redirect to complete ticket
  await handleCompleteTicket(interaction);
}

/**
 * Handle close ticket via command button (legacy)
 */
export async function handleCloseTicketCommand(interaction) {
  await interaction.deferUpdate();
  // Redirect to complete ticket
  await handleCompleteTicket(interaction);
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
  handleCompleteTicket,
  handleCancelTicket,
  handleCancelReasonModal,
  handleCloseTicketCommand,
  handleCloseMM,
  parseTopicData,
  serializeTopicData,
  isUserStaff
};