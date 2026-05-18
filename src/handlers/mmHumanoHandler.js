/**
 * Middleman Humano Handler
 * 
 * Handles the multi-step ephemeral configuration menu for the MM system.
 * Manages the wizard flow: Payment Selection → Role Selection → Counterparty Selection → Ticket Creation
 */

import {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  PermissionFlagsBits,
  ChannelType
} from 'discord.js';
import mmConfig from '../config/mmConfig.js';
import Ticket from '../models/Ticket.js';
import { connectMongoDB } from '../database/mongoose.js';
import { logger } from '../utils/logger.js';

// Custom IDs for the wizard
const WIZARD_IDS = {
  START: 'mm_start_intermediacao',
  PAYMENT_SELECT: 'mm_payment_select',
  ROLE_SELECT: 'mm_role_select',
  COUNTERPARTY_SELECT: 'mm_counterparty_select',
  REQUEST_MM: 'mm_request_middleman',
  CLAIM_MM: 'mm_claim_middleman',
  CLOSE_MM: 'mm_close_intermediacao'
};

// Wizard state stored per interaction user
const wizardStates = new Map();

/**
 * Create the payment method selection embed
 */
function createPaymentSelectEmbed() {
  return new EmbedBuilder()
    .setColor(0x3498DB)
    .setTitle('💳 Selecionar Método de Pagamento')
    .setDescription('Selecione o método de pagamento que será utilizado na intermediação.')
    .setFooter({ text: 'Passo 1 de 3' })
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
    .setTitle('👤 Selecionar seu Papel')
    .setDescription('Você é o comprador ou o vendedor nesta transação?')
    .setFooter({ text: 'Passo 2 de 3' })
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
 * Create the counterparty selection embed
 */
function createCounterpartySelectEmbed(userRole) {
  const roleLabel = userRole === 'buyer' ? 'Vendedor' : 'Comprador';
  const roleEmoji = userRole === 'buyer' ? '🎒' : '🛒';
  
  return new EmbedBuilder()
    .setColor(0x3498DB)
    .setTitle(`${roleEmoji} Selecionar ${roleLabel}`)
    .setDescription(`Selecione o **${roleLabel.toLowerCase()}** com quem você está fazendo a trade.\n\n⚠️ **Atenção:** Você não pode selecionar a si mesmo.`)
    .setFooter({ text: 'Passo 3 de 3' })
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
 * Create the main ticket table embed
 */
function createTicketTableEmbed(data) {
  const { buyer, seller, method, status, middleman } = data;
  
  const statusEmojis = {
    'PENDING': '⏳ AGUARDANDO MIDDLEMAN',
    'NOTIFIED': '⏳ SUPORTE NOTIFICADO',
    'IN_PROGRESS': '🟢 EM ANDAMENTO',
    'COMPLETED': '✅ INTERMEDIAÇÃO CONCLUÍDA',
    'CANCELLED': '❌ INTERMEDIAÇÃO CANCELADA'
  };

  const statusEmoji = statusEmojis[status] || status;

  // Build the table as a code block
  const table = '```' +
    '┌──────────────────────────────────────────┐\n' +
    '│        DADOS DA INTERMEDIAÇÃO            │\n' +
    '├──────────────────────────────────────────┤\n' +
    `│ 💵 Método: ${method.padEnd(27)}│\n` +
    `│ 👤 Comprador: ${buyer.padEnd(24)}│\n` +
    `│ 🎒 Vendedor: ${seller.padEnd(24)}│\n` +
    '├──────────────────────────────────────────┤\n' +
    `│ Status: ${statusEmoji.padEnd(28)}│\n` +
    (middleman ? `│ MM: ${middleman.padEnd(31)}│\n` : '') +
    '└──────────────────────────────────────────┘' +
    '```';

  return new EmbedBuilder()
    .setColor(status === 'IN_PROGRESS' ? 0x2ECC71 : status === 'COMPLETED' ? 0x27AE60 : status === 'CANCELLED' ? 0xE74C3C : 0x3498DB)
    .setTitle('🛡️ Intermediação Ativa')
    .setDescription(table)
    .setFooter({ text: `ID: ${Date.now().toString(36).toUpperCase()}` })
    .setTimestamp();
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
 * Create the "Claim Intermediation" button (for staff only)
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
 * Create the "Close Intermediation" button (for claimed middleman only)
 */
function createCloseMMButton() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(WIZARD_IDS.CLOSE_MM)
        .setLabel('🔒 Fechar Intermediação')
        .setStyle(ButtonStyle.Danger)
    );
}

/**
 * Handle the start button click
 */
async function handleStart(interaction) {
  await interaction.deferUpdate();

  // Initialize wizard state
  wizardStates.set(interaction.user.id, {
    step: 'payment',
    initiatorId: interaction.user.id
  });

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
async function handlePaymentSelect(interaction) {
  const state = wizardStates.get(interaction.user.id);
  if (!state) {
    return interaction.reply({ content: '❌ Sessão expirada. Por favor, inicie novamente.', ephemeral: true });
  }

  const paymentMethod = interaction.values[0];
  state.paymentMethod = paymentMethod;
  state.step = 'role';

  await interaction.update({
    embeds: [createRoleSelectEmbed()],
    components: [createRoleSelectMenu()]
  });
}

/**
 * Handle role selection
 */
async function handleRoleSelect(interaction) {
  const state = wizardStates.get(interaction.user.id);
  if (!state) {
    return interaction.reply({ content: '❌ Sessão expirada. Por favor, inicie novamente.', ephemeral: true });
  }

  const role = interaction.values[0];
  state.userRole = role;
  state.step = 'counterparty';

  await interaction.update({
    embeds: [createCounterpartySelectEmbed(role)],
    components: [createCounterpartySelectMenu()]
  });
}

/**
 * Handle counterparty selection
 */
async function handleCounterpartySelect(interaction) {
  const state = wizardStates.get(interaction.user.id);
  if (!state) {
    return interaction.reply({ content: '❌ Sessão expirada. Por favor, inicie novamente.', ephemeral: true });
  }

  const selectedUser = interaction.values[0];

  // Validation: Cannot select self
  if (selectedUser.id === interaction.user.id) {
    return interaction.reply({
      content: '❌ Você não pode selecionar a si mesmo como contraparte!',
      ephemeral: true
    });
  }

  // Validation: Must select the opposite role
  const expectedRole = state.userRole === 'buyer' ? 'seller' : 'buyer';
  // Note: We can't verify the actual role of the selected user, 
  // but we ensure they're not selecting themselves

  state.counterparty = selectedUser;
  state.step = 'complete';

  // Create the ticket channel
  await createTicketChannel(interaction, state);

  // Clean up wizard state
  wizardStates.delete(interaction.user.id);
}

/**
 * Create the private ticket channel
 */
async function createTicketChannel(interaction, state) {
  try {
    await connectMongoDB();

    const { userRole, counterparty, paymentMethod } = state;
    const initiator = interaction.user;

    // Determine buyer and seller
    const buyer = userRole === 'buyer' ? initiator : counterparty;
    const seller = userRole === 'seller' ? initiator : counterparty;

    // Get or create MM category
    let category;
    if (mmConfig.mmCategoryId) {
      category = interaction.guild.channels.cache.get(mmConfig.mmCategoryId);
    }

    if (!category || category.type !== ChannelType.GuildCategory) {
      category = await interaction.guild.channels.create({
        name: '🛡️ Intermediações',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            deny: [PermissionFlagsBits.ViewChannel]
          }
        ]
      });
    }

    // Create channel name
    const channelName = `mm-${seller.username}-${buyer.username}`.toLowerCase().slice(0, 100);

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
        {
          id: mmConfig.mmRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.AddReactions,
            PermissionFlagsBits.AttachFiles
          ]
        },
        {
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
        }
      ]
    });

    // Set channel topic with MM data
    const topicData = `MM_DATA:buyer=${buyer.id}|seller=${seller.id}|method=${paymentMethod.toUpperCase()}|status=PENDING`;
    await channel.setTopic(topicData);

    // Create ticket in database
    const ticket = new Ticket({
      channelId: channel.id,
      guildId: interaction.guild.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      product: 'Intermediação',
      value: 'N/A',
      status: 'waiting_payment',
      creatorId: initiator.id
    });
    await ticket.save();

    // Prepare data for the table
    const tableData = {
      buyer: `@${buyer.username}`.padEnd(15),
      seller: `@${seller.username}`.padEnd(15),
      method: paymentMethod.toUpperCase(),
      status: 'PENDING',
      middleman: null
    };

    // Send the main table message
    await channel.send({
      content: `🛡️ **Intermediação Criada**\n` +
               `Comprador: ${buyer.toString()} | Vendedor: ${seller.toString()}\n\n` +
               `Clique em "Solicitar Middleman" para chamar um intermediário.`,
      embeds: [createTicketTableEmbed(tableData)],
      components: [createRequestMMButton()]
    });

    // Send info message
    await channel.send({
      content: 'ℹ️ **Informações Importantes:**\n' +
               '• Aguarde um middleman assumir a intermediação\n' +
               '• Siga as instruções do middleman\n' +
               '• Nunca compartilhe dados pessoais\n' +
               '• Somente o middleman pode fechar esta intermediação'
    });

    // Notify the initiator
    await interaction.followUp({
      content: `✅ Intermediação criada com sucesso!\nCanal: ${channel.toString()}`,
      ephemeral: true
    });

    logger.info(`MM ticket created: ${channel.name} | Buyer: ${buyer.id} | Seller: ${seller.id}`);

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
async function handleRequestMM(interaction) {
  await interaction.deferUpdate();

  const channel = interaction.channel;
  const topic = channel.topic || '';

  // Parse topic data
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

  // Update the embed
  const tableData = {
    buyer: `@${(await interaction.guild.members.fetch(data.buyerId))?.user.username || 'Unknown'}`.padEnd(15),
    seller: `@${(await interaction.guild.members.fetch(data.sellerId))?.user.username || 'Unknown'}`.padEnd(15),
    method: data.method,
    status: 'NOTIFIED',
    middleman: null
  };

  const messages = await channel.messages.fetch({ limit: 10 });
  const tableMessage = messages.find(m => m.embeds.length > 0 && m.embeds[0].title === '🛡️ Intermediação Ativa');

  if (tableMessage) {
    await tableMessage.edit({
      embeds: [createTicketTableEmbed(tableData)],
      components: mmConfig.mmRoleId ? [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(WIZARD_IDS.CLAIM_MM)
            .setLabel('✋ Assumir Intermediação')
            .setStyle(ButtonStyle.Secondary)
        )
      ] : []
    });
  }

  // Ping the MM/Staff role
  const roleToPing = mmConfig.mmRoleId || mmConfig.staffRoleId;
  if (roleToPing) {
    await channel.send({
      content: `<@&${roleToPing}> Nova intermediação solicitada!\n` +
               `Comprador: <@${data.buyerId}> | Vendedor: <@${data.sellerId}>`
    });
  }

  await interaction.followUp({
    content: '✅ Middleman notificado. Aguarde alguém assumir.',
    ephemeral: true
  });
}

/**
 * Handle claim middleman button
 */
async function handleClaimMM(interaction) {
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

  // Check if already claimed
  if (data.middlemanId) {
    return interaction.followUp({
      content: `ℹ️ Esta intermediação já foi assumida por <@${data.middlemanId}>.`,
      ephemeral: true
    });
  }

  // Update data
  data.middlemanId = interaction.user.id;
  data.status = 'IN_PROGRESS';
  await channel.setTopic(serializeTopicData(data));

  // Update database
  const ticket = await Ticket.findOne({ channelId: channel.id });
  if (ticket) {
    ticket.middlemanId = interaction.user.id;
    ticket.status = 'payment_received';
    await ticket.save();
  }

  // Update embed
  const tableData = {
    buyer: `@${(await interaction.guild.members.fetch(data.buyerId))?.user.username || 'Unknown'}`.padEnd(15),
    seller: `@${(await interaction.guild.members.fetch(data.sellerId))?.user.username || 'Unknown'}`.padEnd(15),
    method: data.method,
    status: 'IN_PROGRESS',
    middleman: `@${interaction.user.username}`.padEnd(15)
  };

  const messages = await channel.messages.fetch({ limit: 10 });
  const tableMessage = messages.find(m => m.embeds.length > 0 && m.embeds[0].title === '🛡️ Intermediação Ativa');

  if (tableMessage) {
    await tableMessage.edit({
      embeds: [createTicketTableEmbed(tableData)],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(WIZARD_IDS.CLOSE_MM)
            .setLabel('🔒 Fechar Intermediação')
            .setStyle(ButtonStyle.Danger)
        )
      ]
    });
  }

  // Send notification
  await channel.send({
    content: `✅ O Middleman ${interaction.user.toString()} assumiu a intermediação.\n` +
             `Vendedor e Comprador podem prosseguir de forma segura.`
  });

  await interaction.followUp({
    content: '✅ Intermediação assumida com sucesso!',
    ephemeral: true
  });
}

/**
 * Handle close intermediation button
 */
async function handleCloseMM(interaction) {
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
  if (data.middlemanId !== interaction.user.id) {
    return interaction.followUp({
      content: '❌ Apenas o middleman responsável pode fechar esta intermediação.',
      ephemeral: true
    });
  }

  // Update data
  data.status = 'COMPLETED';
  await channel.setTopic(serializeTopicData(data));

  // Update database
  const ticket = await Ticket.findOne({ channelId: channel.id });
  if (ticket) {
    ticket.status = 'trade_completed';
    ticket.closedAt = new Date();
    ticket.tradeSuccessful = true;
    await ticket.save();
  }

  // Update embed
  const tableData = {
    buyer: `@${(await interaction.guild.members.fetch(data.buyerId))?.user.username || 'Unknown'}`.padEnd(15),
    seller: `@${(await interaction.guild.members.fetch(data.sellerId))?.user.username || 'Unknown'}`.padEnd(15),
    method: data.method,
    status: 'COMPLETED',
    middleman: `@${interaction.user.username}`.padEnd(15)
  };

  const messages = await channel.messages.fetch({ limit: 10 });
  const tableMessage = messages.find(m => m.embeds.length > 0 && m.embeds[0].title === '🛡️ Intermediação Ativa');

  if (tableMessage) {
    await tableMessage.edit({
      embeds: [createTicketTableEmbed(tableData)],
      components: [] // Remove all buttons
    });
  }

  // Send final message
  await channel.send({
    content: '🔒 **Intermediação Concluída**\n' +
             `Fechada por: ${interaction.user.toString()}\n\n` +
             'O canal será fechado em 5 segundos...'
  });

  // Delete channel after delay
  setTimeout(async () => {
    if (channel.deletable) {
      await channel.delete();
    }
  }, 5000);

  await interaction.followUp({
    content: '✅ Intermediação concluída com sucesso!',
    ephemeral: true
  });
}

/**
 * Parse topic data
 */
function parseTopicData(topic) {
  if (!topic || !topic.startsWith('MM_DATA:')) {
    return null;
  }

  const dataStr = topic.replace('MM_DATA:', '');
  const data = {};

  dataStr.split('|').forEach(part => {
    const [key, value] = part.split('=');
    data[key] = value;
  });

  return data;
}

/**
 * Serialize topic data
 */
function serializeTopicData(data) {
  const parts = Object.entries(data).map(([key, value]) => `${key}=${value}`);
  return `MM_DATA:${parts.join('|')}`;
}

export {
  WIZARD_IDS,
  handleStart,
  handlePaymentSelect,
  handleRoleSelect,
  handleCounterpartySelect,
  handleRequestMM,
  handleClaimMM,
  handleCloseMM
};

export default {
  wizardIds: WIZARD_IDS,
  handleStart,
  handlePaymentSelect,
  handleRoleSelect,
  handleCounterpartySelect,
  handleRequestMM,
  handleClaimMM,
  handleCloseMM
};