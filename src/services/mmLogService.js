/**
 * MM Log Service - Sistema de Histórico de Intermediações
 * 
 * Este serviço envia logs das intermediações (completas ou canceladas) 
 * para o canal mm-logs para auditoria futura.
 */

import { EmbedBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { logger } from '../utils/logger.js';

// ID do canal de logs (pode ser configurado via variável de ambiente)
const MM_LOGS_CHANNEL_ID = process.env.MM_LOGS_CHANNEL_ID || '1506667572383453374';

/**
 * Verifica se o bot tem permissão para enviar mensagens no canal
 * @param {import('discord.js').TextChannel} channel - O canal a verificar
 * @returns {boolean} True se o bot pode enviar mensagens
 */
function canBotSendMessages(channel) {
  if (!channel || !channel.send) {
    logger.error('MM Log Service: Canal inválido ou não é um text channel', {
      channelId: channel?.id,
      isTextBased: channel?.isTextBased?.()
    });
    return false;
  }

  const permissions = channel.permissionsFor(channel.guild.members.me);
  
  if (!permissions) {
    logger.error('MM Log Service: Não foi possível obter permissões do bot no canal', {
      channelId: channel.id,
      channelName: channel.name,
      botId: channel.guild.members.me?.id
    });
    return false;
  }

  const requiredPerms = [
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.EmbedLinks
  ];

  const missingPerms = requiredPerms.filter(perm => !permissions.has(perm));

  if (missingPerms.length > 0) {
    logger.error('MM Log Service: Bot está faltando permissões no canal', {
      channelId: channel.id,
      channelName: channel.name,
      missingPermissions: missingPerms.map(p => {
        const permMap = {
          [PermissionFlagsBits.SendMessages]: 'SEND_MESSAGES',
          [PermissionFlagsBits.ViewChannel]: 'VIEW_CHANNEL',
          [PermissionFlagsBits.EmbedLinks]: 'EMBED_LINKS'
        };
        return permMap[p] || p;
      })
    });
    return false;
  }

  return true;
}

/**
 * Encontra o canal mm-logs no servidor
 * @param {import('discord.js').Guild} guild - O servidor Discord
 * @returns {import('discord.js').TextChannel|null}
 */
async function findMMLogsChannel(guild) {
  logger.info('MM Log Service: Buscando canal mm-logs', {
    guildId: guild.id,
    guildName: guild.name,
    expectedChannelId: MM_LOGS_CHANNEL_ID
  });

  // Primeiro, tenta buscar pelo ID configurado no cache
  const channelById = guild.channels.cache.get(MM_LOGS_CHANNEL_ID);
  if (channelById && channelById.isTextBased()) {
    logger.info('MM Log Service: Canal encontrado por ID no cache', {
      channelId: channelById.id,
      channelName: channelById.name
    });
    return channelById;
  }

  // Tenta buscar pelo nome no cache
  const channelByName = guild.channels.cache.find(
    ch => ch.name === 'mm-logs' && ch.isTextBased()
  );
  
  if (channelByName) {
    logger.info('MM Log Service: Canal encontrado por nome no cache', {
      channelId: channelByName.id,
      channelName: channelByName.name
    });
    return channelByName;
  }

  // Se não encontrou no cache, tenta fetch da API pelo ID
  logger.info('MM Log Service: Canal não encontrado no cache, tentando fetch da API pelo ID...');
  try {
    const fetchedChannel = await guild.channels.fetch(MM_LOGS_CHANNEL_ID);
    if (fetchedChannel && fetchedChannel.isTextBased()) {
      logger.info('MM Log Service: Canal encontrado via API', {
        channelId: fetchedChannel.id,
        channelName: fetchedChannel.name
      });
      return fetchedChannel;
    }
  } catch (error) {
    logger.warn('MM Log Service: Não foi possível buscar canal por ID via API', { 
      error: error.message,
      guildId: guild.id,
      expectedChannelId: MM_LOGS_CHANNEL_ID
    });
  }

  // Tenta buscar todos os canais do servidor para encontrar pelo nome
  logger.info('MM Log Service: Tentando buscar todos os canais do servidor...');
  try {
    const allChannels = await guild.channels.fetch();
    const mmLogsChannel = allChannels.find(
      ch => ch.name === 'mm-logs' && ch.isTextBased()
    );
    
    if (mmLogsChannel) {
      logger.info('MM Log Service: Canal mm-logs encontrado na busca geral', {
        channelId: mmLogsChannel.id,
        channelName: mmLogsChannel.name
      });
      return mmLogsChannel;
    }
  } catch (error) {
    logger.error('MM Log Service: Erro ao buscar todos os canais', {
      error: error.message,
      guildId: guild.id
    });
  }

  // Debug: lista canais que contêm 'mm' ou 'log' no nome
  const relevantChannels = guild.channels.cache
    .filter(ch => ch.name.includes('mm') || ch.name.includes('log'))
    .map(ch => ({ id: ch.id, name: ch.name, type: ch.type }));
  
  logger.warn('MM Log Service: Canal mm-logs NÃO encontrado.', {
    totalChannelsInCache: guild.channels.cache.size,
    expectedChannelId: MM_LOGS_CHANNEL_ID,
    expectedChannelName: 'mm-logs',
    relevantChannelsFound: relevantChannels
  });

  // Tenta CRIAR o canal automaticamente se não existir
  logger.info('MM Log Service: Tentando CRIAR canal mm-logs automaticamente...');
  try {
    const newChannel = await guild.channels.create({
      name: 'mm-logs',
      type: ChannelType.GuildText,
      reason: 'Auto-criado pelo MM Log Service',
      permissionOverwrites: [
        {
          id: guild.id,
          deny: ['ViewChannel'] // Apenas o bot pode ver
        },
        {
          id: guild.members.me.id,
          allow: ['SendMessages', 'ViewChannel', 'EmbedLinks', 'ReadMessageHistory']
        }
      ]
    });

    logger.info('MM Log Service: Canal mm-logs CRIADO com sucesso!', {
      channelId: newChannel.id,
      channelName: newChannel.name,
      guildId: guild.id
    });
    
    return newChannel;
  } catch (createError) {
    logger.error('MM Log Service: Falha ao criar canal mm-logs automaticamente', {
      error: createError.message,
      guildId: guild.id,
      reason: 'Bot pode não ter permissão MANAGE_CHANNELS'
    });
  }

  return null;
}

/**
 * Formata data para padrão brasileiro
 */
function formatBrazilianDate(date) {
  return new Date(date).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Calcula a taxa do MM baseada no valor da transação
 */
function calculateMMFee(amountDisplay) {
  if (!amountDisplay) return 'R$ 0,00';
  
  let numericStr = String(amountDisplay).replace(/[^0-9,\.]/g, '').trim();
  if (numericStr.includes(',') && !numericStr.includes('.')) {
    numericStr = numericStr.replace(',', '.');
  }
  const amount = parseFloat(numericStr);
  
  if (isNaN(amount)) return 'R$ 0,00';
  
  let fee;
  if (amount <= 2.5) fee = 0.5;
  else if (amount <= 100) fee = 1.0;
  else if (amount <= 200) fee = 2.0;
  else if (amount <= 400) fee = 3.5;
  else if (amount <= 600) fee = 5.0;
  else if (amount <= 700) fee = 7.0;
  else fee = parseFloat((amount * 0.012).toFixed(2));
  
  return 'R$ ' + fee.toFixed(2).replace('.', ',');
}

/**
 * Calcula o valor total (valor + taxa)
 */
function calculateTotal(amountDisplay) {
  if (!amountDisplay) return 'R$ 0,00';
  
  let numericStr = String(amountDisplay).replace(/[^0-9,\.]/g, '').trim();
  if (numericStr.includes(',') && !numericStr.includes('.')) {
    numericStr = numericStr.replace(',', '.');
  }
  const amount = parseFloat(numericStr);
  
  if (isNaN(amount)) return 'R$ 0,00';
  
  let fee;
  if (amount <= 2.5) fee = 0.5;
  else if (amount <= 100) fee = 1.0;
  else if (amount <= 200) fee = 2.0;
  else if (amount <= 400) fee = 3.5;
  else if (amount <= 600) fee = 5.0;
  else if (amount <= 700) fee = 7.0;
  else fee = parseFloat((amount * 0.012).toFixed(2));
  
  const total = amount + fee;
  return 'R$ ' + total.toFixed(2).replace('.', ',');
}

/**
 * Cria um embed de log para intermediação completada com sucesso
 */
function createSuccessLogEmbed(data, middleman, guild) {
  const buyerName = data.buyerUsername || 'Unknown';
  const sellerName = data.sellerUsername || 'Unknown';
  const mmName = middleman?.username || 'Unknown';
  
  const embed = new EmbedBuilder()
    .setColor(0x27AE60) // Verde
    .setTitle('✅ Intermediação Concluída com Sucesso')
    .setDescription(`Registro de intermediação finalizada com êxito.`)
    .addFields(
      {
        name: '📋 Dados da Transação',
        value: [
          `**Método:** ${data.method || 'N/A'}`,
          `**Valor:** ${data.amount || 'N/A'}`,
          `**Taxa MM:** ${calculateMMFee(data.amount)}`,
          `**Total:** ${calculateTotal(data.amount)}`
        ].join('\n'),
        inline: false
      },
      {
        name: '👥 Envolvidos',
        value: [
          `**Comprador:** ${buyerName}`,
          `**Vendedor:** ${sellerName}`,
          `**Middleman:** ${mmName}`
        ].join('\n'),
        inline: false
      },
      {
        name: 'ℹ️ Informações Adicionais',
        value: [
          `**ID do Ticket:** ${data.ticketId || 'N/A'}`,
          `**Canal:** ${data.channelName || 'N/A'}`,
          `**Concluído por:** ${mmName}`,
          `**Data:** ${formatBrazilianDate(new Date())}`
        ].join('\n'),
        inline: false
      }
    )
    .setFooter({ 
      text: `MM Log System • Guild: ${guild.name}`,
      iconURL: guild.iconURL() 
    })
    .setTimestamp();

  return embed;
}

/**
 * Cria um embed de log para intermediação cancelada
 */
function createCancelledLogEmbed(data, middleman, guild, cancelReason) {
  const buyerName = data.buyerUsername || 'Unknown';
  const sellerName = data.sellerUsername || 'Unknown';
  const mmName = middleman?.username || 'Unknown';
  
  const embed = new EmbedBuilder()
    .setColor(0xE74C3C) // Vermelho
    .setTitle('❌ Intermediação Cancelada')
    .setDescription(`Registro de intermediação cancelada.`)
    .addFields(
      {
        name: '📋 Dados da Transação',
        value: [
          `**Método:** ${data.method || 'N/A'}`,
          `**Valor:** ${data.amount || 'N/A'}`,
          `**Taxa MM:** ${calculateMMFee(data.amount)}`,
          `**Total:** ${calculateTotal(data.amount)}`
        ].join('\n'),
        inline: false
      },
      {
        name: '👥 Envolvidos',
        value: [
          `**Comprador:** ${buyerName}`,
          `**Vendedor:** ${sellerName}`,
          `**Middleman:** ${mmName}`
        ].join('\n'),
        inline: false
      },
      {
        name: '🚫 Motivo do Cancelamento',
        value: `>>> ${cancelReason || 'Motivo não informado'}`,
        inline: false
      },
      {
        name: 'ℹ️ Informações Adicionais',
        value: [
          `**ID do Ticket:** ${data.ticketId || 'N/A'}`,
          `**Canal:** ${data.channelName || 'N/A'}`,
          `**Cancelado por:** ${mmName}`,
          `**Data:** ${formatBrazilianDate(new Date())}`
        ].join('\n'),
        inline: false
      }
    )
    .setFooter({ 
      text: `MM Log System • Guild: ${guild.name}`,
      iconURL: guild.iconURL() 
    })
    .setTimestamp();

  return embed;
}

/**
 * Envia log de intermediação completada com sucesso
 * @param {import('discord.js').Guild} guild - O servidor Discord
 * @param {Object} ticketData - Dados do ticket
 * @param {import('discord.js').User|import('discord.js').GuildMember} middleman - O middleman que concluiu
 */
export async function sendSuccessLog(guild, ticketData, middleman) {
  try {
    const logChannel = await findMMLogsChannel(guild);
    if (!logChannel) {
      logger.error('MM Log Service: Canal mm-logs não encontrado para envio de log de sucesso', {
        guildId: guild.id,
        guildName: guild.name,
        expectedChannelId: MM_LOGS_CHANNEL_ID
      });
      return false;
    }

    // Verifica permissões do bot ANTES de enviar
    if (!canBotSendMessages(logChannel)) {
      logger.error('MM Log Service: Bot não tem permissão para enviar mensagens no canal mm-logs', {
        guildId: guild.id,
        guildName: guild.name,
        channelId: logChannel.id,
        channelName: logChannel.name
      });
      return false;
    }

    const embed = createSuccessLogEmbed(ticketData, middleman, guild);
    await logChannel.send({ embeds: [embed] });
    
    logger.info('MM Log Service: Log de sucesso enviado com sucesso', {
      guildId: guild.id,
      ticketId: ticketData.ticketId,
      buyer: ticketData.buyerUsername,
      seller: ticketData.sellerUsername,
      channelId: logChannel.id
    });
    
    return true;
  } catch (error) {
    logger.error('MM Log Service: Erro ao enviar log de sucesso', {
      error: error.message,
      errorCode: error.code,
      errorStatus: error.status,
      guildId: guild.id
    });
    return false;
  }
}

/**
 * Envia log de intermediação cancelada
 * @param {import('discord.js').Guild} guild - O servidor Discord
 * @param {Object} ticketData - Dados do ticket
 * @param {import('discord.js').User|import('discord.js').GuildMember} middleman - O middleman que cancelou
 * @param {string} cancelReason - Motivo do cancelamento
 */
export async function sendCancelledLog(guild, ticketData, middleman, cancelReason) {
  try {
    const logChannel = await findMMLogsChannel(guild);
    if (!logChannel) {
      logger.error('MM Log Service: Canal mm-logs não encontrado para envio de log de cancelamento', {
        guildId: guild.id,
        guildName: guild.name,
        expectedChannelId: MM_LOGS_CHANNEL_ID
      });
      return false;
    }

    // Verifica permissões do bot ANTES de enviar
    if (!canBotSendMessages(logChannel)) {
      logger.error('MM Log Service: Bot não tem permissão para enviar mensagens no canal mm-logs', {
        guildId: guild.id,
        guildName: guild.name,
        channelId: logChannel.id,
        channelName: logChannel.name
      });
      return false;
    }

    const embed = createCancelledLogEmbed(ticketData, middleman, guild, cancelReason);
    await logChannel.send({ embeds: [embed] });
    
    logger.info('MM Log Service: Log de cancelamento enviado com sucesso', {
      guildId: guild.id,
      ticketId: ticketData.ticketId,
      buyer: ticketData.buyerUsername,
      seller: ticketData.sellerUsername,
      reason: cancelReason,
      channelId: logChannel.id
    });
    
    return true;
  } catch (error) {
    logger.error('MM Log Service: Erro ao enviar log de cancelamento', {
      error: error.message,
      errorCode: error.code,
      errorStatus: error.status,
      guildId: guild.id
    });
    return false;
  }
}

/**
 * Prepara os dados do ticket para o log, buscando informações dos membros
 * @param {import('discord.js').Guild} guild - O servidor Discord
 * @param {Object} data - Dados do ticket do topic do canal
 * @returns {Promise<Object>} Dados formatados para o log
 */
export async function prepareTicketDataForLog(guild, data) {
  const buyerMember = await guild.members.fetch(data.buyerId).catch(() => null);
  const sellerMember = await guild.members.fetch(data.sellerId).catch(() => null);
  
  return {
    buyerId: data.buyerId,
    buyerUsername: buyerMember?.user.username || 'Unknown',
    sellerId: data.sellerId,
    sellerUsername: sellerMember?.user.username || 'Unknown',
    method: data.method || 'N/A',
    amount: data.amount || 'N/A',
    ticketId: data.tableMessageId || 'N/A',
    channelName: `mm-${buyerMember?.user.username || 'unknown'}-e-${sellerMember?.user.username || 'unknown'}`
  };
}

export default {
  sendSuccessLog,
  sendCancelledLog,
  prepareTicketDataForLog,
  findMMLogsChannel
};