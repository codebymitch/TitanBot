/**
 * MM Log Service - Sistema de Histórico de Intermediações
 * 
 * Este serviço envia logs das intermediações (completas ou canceladas) 
 * para o canal mm-logs para auditoria futura.
 */

import { EmbedBuilder } from 'discord.js';
import { logger } from '../utils/logger.js';

// ID do canal de logs (pode ser configurado via variável de ambiente)
const MM_LOGS_CHANNEL_ID = process.env.MM_LOGS_CHANNEL_ID || '1506667572383453374';

/**
 * Encontra o canal mm-logs no servidor
 * @param {import('discord.js').Guild} guild - O servidor Discord
 * @returns {import('discord.js').TextChannel|null}
 */
async function findMMLogsChannel(guild) {
  // Tenta buscar pelo ID configurado
  const channelById = guild.channels.cache.get(MM_LOGS_CHANNEL_ID);
  if (channelById && channelById.isTextBased()) {
    return channelById;
  }

  // Tenta buscar pelo nome
  const channelByName = guild.channels.cache.find(
    ch => ch.name === 'mm-logs' && ch.isTextBased()
  );
  
  if (channelByName) {
    return channelByName;
  }

  // Se não encontrou, tenta fetch da API
  try {
    const fetchedChannel = await guild.channels.fetch(MM_LOGS_CHANNEL_ID);
    if (fetchedChannel && fetchedChannel.isTextBased()) {
      return fetchedChannel;
    }
  } catch (error) {
    logger.warn('MM Log Service: Canal mm-logs não encontrado', { 
      error: error.message,
      guildId: guild.id 
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
      logger.warn('MM Log Service: Canal mm-logs não encontrado para envio de log de sucesso');
      return false;
    }

    const embed = createSuccessLogEmbed(ticketData, middleman, guild);
    await logChannel.send({ embeds: [embed] });
    
    logger.info('MM Log Service: Log de sucesso enviado', {
      guildId: guild.id,
      ticketId: ticketData.ticketId,
      buyer: ticketData.buyerUsername,
      seller: ticketData.sellerUsername
    });
    
    return true;
  } catch (error) {
    logger.error('MM Log Service: Erro ao enviar log de sucesso', {
      error: error.message,
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
      logger.warn('MM Log Service: Canal mm-logs não encontrado para envio de log de cancelamento');
      return false;
    }

    const embed = createCancelledLogEmbed(ticketData, middleman, guild, cancelReason);
    await logChannel.send({ embeds: [embed] });
    
    logger.info('MM Log Service: Log de cancelamento enviado', {
      guildId: guild.id,
      ticketId: ticketData.ticketId,
      buyer: ticketData.buyerUsername,
      seller: ticketData.sellerUsername,
      reason: cancelReason
    });
    
    return true;
  } catch (error) {
    logger.error('MM Log Service: Erro ao enviar log de cancelamento', {
      error: error.message,
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