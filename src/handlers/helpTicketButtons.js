/**
 * Help Ticket Button Handlers
 * 
 * Handles the support ticket system triggered by the /setup-help command.
 * This is a simplified ticket system focused on user support with strict rules.
 * 
 * Rules:
 * - Staff (role ID: 1505631589407658064) cannot open support tickets
 * - Only staff can close tickets
 * - Modal required for closing with summary
 * - Logs sent to mm-logs channel
 */

import {
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { getTicketData, saveTicketData, deleteTicketData } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { createEmbed, errorEmbed, successEmbed } from '../utils/embeds.js';
import { logTicketEvent } from '../utils/ticketLogging.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import versionConfig from '../config/version.js';
import { findMMLogsChannel } from '../services/mmLogService.js';

// Custom IDs
export const HELP_CREATE_TICKET_ID = 'help_create_ticket';
export const HELP_CLOSE_TICKET_ID = 'help_close_ticket';
export const HELP_CLOSE_MODAL_ID = 'help_close_modal';

// Staff role ID - hardcoded as per requirements
const SUPPORT_ROLE_ID = '1505631589407658064';

async function resolveGuildMember(interaction) {
  if (interaction?.member) {
    return interaction.member;
  }

  if (!interaction.inGuild()) {
    return null;
  }

  try {
    return await interaction.guild.members.fetch(interaction.user.id);
  } catch (error) {
    logger.warn(`Could not fetch member for support ticket interaction: ${error.message}`);
    return null;
  }
}

/**
 * Check if user has the Support role
 */
function isSupportStaff(member) {
  if (!member) return false;
  return member.roles?.cache?.has(SUPPORT_ROLE_ID);
}

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
      const member = await resolveGuildMember(interaction);

      // BLOCK: Staff members cannot open support tickets
      if (isSupportStaff(member)) {
        return await interaction.reply({
          embeds: [errorEmbed(
            '🚫 Acesso Restrito',
            'Membros da equipe de Suporte não podem abrir tickets de suporte.\n\nCaso precise de assistência, entre em contato diretamente com outros membros da administração.'
          )],
          flags: MessageFlags.Ephemeral
        });
      }

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

      // Create the ticket channel with strict permissions
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
          // ONLY Support role can view and respond
          {
            id: SUPPORT_ROLE_ID,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageMessages,
            ],
          },
        ],
      });

      // Save ticket data
      const ticketData = {
        id: channel.id,
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        userName: interaction.user.username,
        guildId: interaction.guildId,
        createdAt: new Date().toISOString(),
        status: 'open',
        type: 'support',
        closedBy: null,
        closedAt: null,
        closeReason: null,
        attendedBy: null,
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
                     '**⏱️ Tempo médio de atendimento:** Até **1 hora**',
        color: 0x5865F2,
        footer: { text: versionConfig.getFooter() }
      });

      // Create buttons row - only staff can close
      const buttonsRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(HELP_CLOSE_TICKET_ID)
          .setLabel('🔒 Terminar Atendimento')
          .setStyle(ButtonStyle.Danger)
      );

      // Send welcome message
      await channel.send({
        content: `${interaction.user.toString()} <@&${SUPPORT_ROLE_ID}>`,
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
 * Only staff can click this button
 */
const helpCloseTicketHandler = {
  name: HELP_CLOSE_TICKET_ID,
  async execute(interaction, client) {
    try {
      const member = await resolveGuildMember(interaction);

      // BLOCK: Only Support staff can close tickets
      if (!isSupportStaff(member)) {
        return await interaction.reply({
          embeds: [errorEmbed(
            '🚫 Permissão Negada',
            'Apenas a equipe de suporte pode encerrar o ticket.\n\nSe você é o criador do ticket e precisa de ajuda, aguarde um membro do suporte.'
          )],
          flags: MessageFlags.Ephemeral
        });
      }

      // Check if this is a valid support ticket
      const ticketData = await getTicketData(interaction.guildId, interaction.channelId);
      
      if (!ticketData || ticketData.type !== 'support') {
        return await interaction.reply({
          embeds: [errorEmbed('❌ Ticket Inválido', 'Este comando só pode ser usado em tickets de suporte.')],
          flags: MessageFlags.Ephemeral
        });
      }

      if (ticketData.status !== 'open') {
        return await interaction.reply({
          embeds: [errorEmbed('❌ Ticket Já Fechado', 'Este ticket já foi encerrado.')],
          flags: MessageFlags.Ephemeral
        });
      }

      // Open the modal for summary
      const modal = new ModalBuilder()
        .setCustomId(`${HELP_CLOSE_MODAL_ID}:${interaction.channelId}`)
        .setTitle('🔒 Encerrar Atendimento');

      const reasonInput = new TextInputBuilder()
        .setCustomId('summary')
        .setLabel('Resumo do Acontecido')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Descreva o que foi feito neste atendimento...')
        .setRequired(true)
        .setMaxLength(2000);

      const actionRow = new ActionRowBuilder().addComponents(reasonInput);
      modal.addComponents(actionRow);

      await interaction.showModal(modal);

    } catch (error) {
      logger.error('Error opening close ticket modal:', error);
      
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          embeds: [errorEmbed('❌ Erro', 'Não foi possível abrir o formulário de encerramento.')],
          flags: MessageFlags.Ephemeral
        });
      }
    }
  }
};

/**
 * Handler for the close ticket modal submission
 */
const helpCloseModalHandler = {
  name: HELP_CLOSE_MODAL_ID,
  async execute(interaction, client) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const member = await resolveGuildMember(interaction);
      // Extract channel ID from custom ID
      const parts = interaction.customId.split(':');
      const channelId = parts[1] || interaction.channelId;

      // Verify staff permission again
      if (!isSupportStaff(member)) {
        return await interaction.editReply({
          embeds: [errorEmbed('🚫 Permissão Negada', 'Apenas a equipe de suporte pode encerrar tickets.')],
        });
      }

      // Get ticket data
      const ticketData = await getTicketData(interaction.guildId, channelId);
      
      if (!ticketData || ticketData.type !== 'support') {
        return await interaction.editReply({
          embeds: [errorEmbed('❌ Ticket Inválido', 'Este ticket não foi encontrado ou já foi encerrado.')],
        });
      }

      const summary = interaction.fields.getTextInputValue('summary');
      const channel = interaction.guild.channels.cache.get(channelId);

      // Update ticket data
      ticketData.status = 'closed';
      ticketData.closedBy = interaction.user.id;
      ticketData.closedAt = new Date().toISOString();
      ticketData.attendedBy = interaction.user.id;
      ticketData.closeReason = summary;
      
      await saveTicketData(interaction.guildId, channelId, ticketData);

      // Calculate duration
      const createdAt = new Date(ticketData.createdAt);
      const closedAt = new Date(ticketData.closedAt);
      const durationMs = closedAt - createdAt;
      const durationMinutes = Math.floor(durationMs / 60000);
      const durationHours = Math.floor(durationMinutes / 60);

      // Send log to mm-logs channel
      try {
        const logChannel = await findMMLogsChannel(interaction.guild);
        
        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🛠️ Ticket de Suporte Encerrado')
            .setDescription(`Ticket de suporte finalizado com atendimento.`)
            .addFields(
              {
                name: '📋 Informações do Ticket',
                value: [
                  `**Número:** #${ticketData.id}`,
                  `**Canal:** #${channel?.name || 'deletado'}`,
                  `**ID do Canal:** \`${channelId}\``
                ].join('\n'),
                inline: false
              },
              {
                name: '👥 Envolvidos',
                value: [
                  `**Usuário:** ${ticketData.userTag} (<@${ticketData.userId}>)`,
                  `**Atendido por:** ${interaction.user.tag} (<@${interaction.user.id}>)`
                ].join('\n'),
                inline: false
              },
              {
                name: '⏱️ Duração',
                value: durationHours > 0 
                  ? `${durationHours}h ${durationMinutes % 60}min`
                  : `${durationMinutes} minutos`,
                inline: true
              },
              {
                name: '📝 Resumo do Atendimento',
                value: `>>> ${summary || 'Nenhum resumo fornecido'}`,
                inline: false
              },
              {
                name: 'ℹ️ Detalhes',
                value: [
                  `**Aberto em:** <t:${Math.floor(createdAt.getTime() / 1000)}:F>`,
                  `**Fechado em:** <t:${Math.floor(closedAt.getTime() / 1000)}:F>`,
                  `**Data:** ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
                ].join('\n'),
                inline: false
              }
            )
            .setFooter({ text: versionConfig.getFooter() })
            .setTimestamp();

          await logChannel.send({ embeds: [logEmbed] });
        }
      } catch (logError) {
        logger.warn('Failed to send support ticket log:', logError.message);
      }

      // Log the ticket event
      await logTicketEvent({
        client: client,
        guildId: interaction.guildId,
        event: {
          type: 'close',
          ticketId: channelId,
          ticketNumber: ticketData.id,
          userId: ticketData.userId,
          executorId: interaction.user.id,
          reason: summary,
          metadata: {
            closedAt: ticketData.closedAt,
            ticketType: 'support',
            attendedBy: interaction.user.id,
            duration: durationMs
          }
        }
      });

      // Send closure message in the ticket channel
      if (channel) {
        const closeEmbed = createEmbed({
          title: '🔒 Atendimento Encerrado',
          description: `Este ticket foi encerrado por ${interaction.user}.\n\n` +
                       'O canal será deletado em **5 segundos**.\n' +
                       'Obrigado por usar nosso sistema de suporte!',
          color: 0x27AE60,
          footer: { text: `ID do Ticket: #${ticketData.id}` }
        });

        await channel.send({ embeds: [closeEmbed] });

        // Delete channel after delay
        setTimeout(async () => {
          try {
            await channel.delete('Support ticket closed');
          } catch (deleteError) {
            logger.error('Error deleting support ticket channel:', deleteError.message);
          }
        }, 5000);
      }

      await interaction.editReply({
        embeds: [successEmbed('✅ Atendimento Encerrado', 'O ticket foi fechado e o log enviado. O canal será deletado em instantes.')],
      });

    } catch (error) {
      logger.error('Error closing support ticket via modal:', error);
      
      const errorMessage = '❌ Ocorreu um erro ao encerrar o ticket.';
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  }
};

export default helpCreateTicketHandler;
export { helpCreateTicketHandler, helpCloseTicketHandler, helpCloseModalHandler };