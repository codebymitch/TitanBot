/**
 * Help Ticket Button Handlers
 * 
 * Handles the support ticket system triggered by the /setup-help command.
 * This is a simplified ticket system focused on user support.
 */

import {
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags
} from 'discord.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { getTicketData, saveTicketData, deleteTicketData, getOpenTicketCountForUser, incrementTicketCounter } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { createEmbed, errorEmbed, successEmbed } from '../utils/embeds.js';
import { logTicketEvent } from '../utils/ticketLogging.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import versionConfig from '../config/version.js';

// Custom IDs
export const HELP_CREATE_TICKET_ID = 'help_create_ticket';
export const HELP_CLOSE_TICKET_ID = 'help_close_ticket';
export const HELP_CLOSE_TICKET_CONFIRM_ID = 'help_close_ticket_confirm';

/**
 * Get the next ticket number for support tickets
 */
async function getNextSupportTicketNumber(guildId) {
  const key = `guild:${guildId}:support:ticket:counter`;
  const { db } = await import('../utils/database.js');
  
  if (!db.initialized) {
    await db.initialize();
  }
  
  const currentCounter = await db.get(key) || 0;
  const nextCounter = currentCounter + 1;
  await db.set(key, nextCounter);
  
  return nextCounter.toString().padStart(3, '0');
}

/**
 * Check if user already has an open support ticket
 */
async function getUserOpenSupportTicket(guildId, userId) {
  try {
    const { db } = await import('../utils/database.js');
    
    if (!db.initialized) {
      await db.initialize();
    }

    if (db.db?.pool && typeof db.db.isAvailable === 'function' && db.db.isAvailable()) {
      const { pgConfig } = await import('../config/postgres.js');
      const result = await db.db.pool.query(
        `SELECT id, data FROM ${pgConfig.tables.tickets}
         WHERE guild_id = $1
           AND data->>'userId' = $2
           AND data->>'type' = 'support'
           AND data->>'status' = 'open'
         LIMIT 1`,
        [guildId, userId]
      );

      if (result.rows?.length > 0) {
        return result.rows[0];
      }
      return null;
    }

    // Fallback to key-value storage
    if (typeof db.list === 'function') {
      const ticketKeys = await db.list(`guild:${guildId}:ticket:`);
      
      for (const key of ticketKeys) {
        const ticket = await db.get(key);
        if (ticket && ticket.userId === userId && ticket.type === 'support' && ticket.status === 'open') {
          return { id: ticket.id, data: ticket };
        }
      }
    }

    return null;
  } catch (error) {
    logger.error('Error checking for open support ticket:', error);
    return null;
  }
}

/**
 * Handler for the "Create Ticket" button from /setup-help
 */
const helpCreateTicketHandler = {
  name: HELP_CREATE_TICKET_ID,
  async execute(interaction, client) {
    try {
      // Check rate limit
      const rateLimitKey = `${interaction.user.id}:help_create_ticket`;
      const allowed = await checkRateLimit(rateLimitKey, 2, 60000);
      if (!allowed) {
        return await interaction.reply({
          embeds: [errorEmbed('⏳ Aguarde um momento', 'Você está criando tickets muito rapidamente. Por favor, aguarde um minuto e tente novamente.')],
          flags: MessageFlags.Ephemeral
        });
      }

      // Check if user already has an open support ticket
      const existingTicket = await getUserOpenSupportTicket(interaction.guildId, interaction.user.id);
      if (existingTicket) {
        return await interaction.reply({
          embeds: [errorEmbed(
            '🎫 Ticket Já Existente',
            `Você já possui um ticket de suporte aberto: <#${existingTicket.id}>\n\nPor favor, utilize o ticket existente para continuar o atendimento.`
          )],
          flags: MessageFlags.Ephemeral
        });
      }

      // Defer the interaction
      const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferred) return;

      const config = await getGuildConfig(client, interaction.guildId);
      const ticketConfig = config.tickets || {};
      
      // Get or create ticket category
      let category = ticketConfig.supportCategoryId 
        ? interaction.guild.channels.cache.get(ticketConfig.supportCategoryId)
        : interaction.guild.channels.cache.find(c => 
            c.type === ChannelType.GuildCategory && 
            c.name.toLowerCase().includes('suporte')
          );

      if (!category) {
        // Create a new category if none exists
        category = await interaction.guild.channels.create({
          name: '🛠️・Suporte',
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            {
              id: interaction.guild.id,
              deny: [PermissionFlagsBits.ViewChannel],
            },
          ],
        });

        // Save the category ID in config
        ticketConfig.supportCategoryId = category.id;
        config.tickets = ticketConfig;
        const { setGuildConfig } = await import('../utils/database.js');
        await setGuildConfig(client, interaction.guildId, config);
      }

      // Get ticket number
      const ticketNumber = await getNextSupportTicketNumber(interaction.guildId);
      
      // Create channel name
      const channelName = `suporte-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}-${ticketNumber}`.slice(0, 100);

      // Create the ticket channel
      const channel = await interaction.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
          ...(config.ticketStaffRoleId ? [{
            id: config.ticketStaffRoleId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          }] : []),
          // Also allow users with ManageChannels permission (admins)
          {
            id: interaction.guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
        ],
      });

      // Save ticket data
      const ticketData = {
        id: channel.id,
        userId: interaction.user.id,
        guildId: interaction.guildId,
        createdAt: new Date().toISOString(),
        status: 'open',
        type: 'support',
        claimedBy: null,
        reason: 'Support ticket created via /setup-help',
      };

      await saveTicketData(interaction.guildId, channel.id, ticketData);

      // Create welcome embed
      const welcomeEmbed = createEmbed({
        title: `🛠️ Ticket de Suporte #${ticketNumber}`,
        description: `Olá ${interaction.user.toString()}! 👋\n\n` +
                     'Seu ticket de suporte foi criado com sucesso. Por favor, descreva seu problema ou dúvida abaixo e aguarde nossa equipe.\n\n' +
                     '**📋 Informações do Ticket:**\n' +
                     `• **Criado por:** ${interaction.user.tag}\n` +
                     `• **Data:** <t:${Math.floor(Date.now() / 1000)}:F>\n` +
                     `• **ID:** ${channel.id}\n\n` +
                     '**⏱️ Tempo médio de resposta:** Até 24 horas',
        color: 0x5865F2,
        footer: { text: versionConfig.getFooter() }
      });

      // Create buttons row
      const buttonsRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(HELP_CLOSE_TICKET_ID)
          .setLabel('🔒 Fechar Ticket')
          .setStyle(ButtonStyle.Danger)
      );

      // Send welcome message
      const staffMention = config.ticketStaffRoleId ? ` <@&${config.ticketStaffRoleId}>` : '';
      await channel.send({
        content: `${interaction.user.toString()}${staffMention}`,
        embeds: [welcomeEmbed],
        components: [buttonsRow]
      });

      // Log the ticket event
      await logTicketEvent({
        client: client,
        guildId: interaction.guildId,
        event: {
          type: 'open',
          ticketId: channel.id,
          ticketNumber: ticketNumber,
          userId: interaction.user.id,
          executorId: interaction.user.id,
          reason: 'Support ticket',
          metadata: {
            channelId: channel.id,
            categoryName: category.name,
            ticketType: 'support'
          }
        }
      });

      // Respond to the user
      await interaction.editReply({
        embeds: [successEmbed(
          '✅ Ticket Criado!',
          `Seu ticket de suporte foi criado: ${channel}`
        )]
      });

    } catch (error) {
      logger.error('Error creating support ticket:', error);
      
      const errorMessage = '❌ Ocorreu um erro ao criar seu ticket. Por favor, tente novamente em instantes.';
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  }
};

/**
 * Handler for the "Close Ticket" button inside support tickets
 */
const helpCloseTicketHandler = {
  name: HELP_CLOSE_TICKET_ID,
  async execute(interaction, client) {
    try {
      // Check permissions - only ticket creator or staff can close
      const ticketData = await getTicketData(interaction.guildId, interaction.channelId);
      
      if (!ticketData || ticketData.type !== 'support') {
        return await interaction.reply({
          embeds: [errorEmbed('❌ Ticket Inválido', 'Este comando só pode ser usado em tickets de suporte.')],
          flags: MessageFlags.Ephemeral
        });
      }

      const isTicketCreator = ticketData.userId === interaction.user.id;
      const guildConfig = await getGuildConfig(client, interaction.guildId);
      const isStaff = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) || 
                      (guildConfig.ticketStaffRoleId && interaction.member.roles.cache.has(guildConfig.ticketStaffRoleId));

      if (!isTicketCreator && !isStaff) {
        return await interaction.reply({
          embeds: [errorEmbed('❌ Permissão Negada', 'Apenas o criador do ticket ou membros da equipe podem fechar este ticket.')],
          flags: MessageFlags.Ephemeral
        });
      }

      // Defer the interaction
      const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferred) return;

      // Update ticket data
      ticketData.status = 'closed';
      ticketData.closedBy = interaction.user.id;
      ticketData.closedAt = new Date().toISOString();
      
      await saveTicketData(interaction.guildId, interaction.channelId, ticketData);

      // Remove permissions from user
      try {
        await interaction.channel.permissionOverwrites.edit(ticketData.userId, {
          ViewChannel: false,
          SendMessages: false,
        });
      } catch (permError) {
        logger.warn('Could not update permissions when closing support ticket:', permError.message);
      }

      // Update the original message
      const messages = await interaction.channel.messages.fetch({ limit: 10 });
      const welcomeMessage = messages.find(m => 
        m.embeds.length > 0 && m.embeds[0].title?.includes('Ticket de Suporte')
      );

      if (welcomeMessage) {
        const updatedEmbed = EmbedBuilder.from(welcomeMessage.embeds[0])
          .setColor(0xE74C3C)
          .setFooter({ text: `Ticket fechado por ${interaction.user.tag}` });
        
        await welcomeMessage.edit({
          embeds: [updatedEmbed],
          components: []
        });
      }

      // Send closure message
      const closeEmbed = createEmbed({
        title: '🔒 Ticket Fechado',
        description: `Este ticket foi fechado por ${interaction.user}.\n\n` +
                     'O canal será deletado em **5 segundos**.\n' +
                     'Obrigado por usar nosso sistema de suporte!',
        color: 0xE74C3C,
        footer: { text: `ID do Ticket: ${ticketData.id}` }
      });

      await interaction.channel.send({ embeds: [closeEmbed] });

      // Log the ticket event
      await logTicketEvent({
        client: client,
        guildId: interaction.guildId,
        event: {
          type: 'close',
          ticketId: interaction.channelId,
          ticketNumber: ticketData.id,
          userId: ticketData.userId,
          executorId: interaction.user.id,
          metadata: {
            closedAt: ticketData.closedAt,
            ticketType: 'support'
          }
        }
      });

      // Respond to interaction
      await interaction.editReply({
        embeds: [successEmbed('Ticket Fechado', 'Este ticket será deletado em instantes.')],
        flags: MessageFlags.Ephemeral
      });

      // Delete channel after delay
      setTimeout(async () => {
        try {
          await interaction.channel.delete('Support ticket closed');
        } catch (deleteError) {
          logger.error('Error deleting support ticket channel:', deleteError.message);
        }
      }, 5000);

    } catch (error) {
      logger.error('Error closing support ticket:', error);
      
      const errorMessage = '❌ Ocorreu um erro ao fechar o ticket.';
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  }
};

export default helpCreateTicketHandler;
export { helpCreateTicketHandler, helpCloseTicketHandler };