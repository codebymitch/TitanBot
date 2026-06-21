// src/commands/Ticket/modules/ticket_panels.js
// Multi-panel management module

import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { getColor } from '../../../config/bot.js';
import { createEmbed, successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes, TitanBotError } from '../../../utils/errorHandler.js';
import { getFromDb, setInDb } from '../../../utils/database.js';

const PANELS_KEY = (guildId) => `ticket_panels_${guildId}`;

export async function getPanels(guildId) {
  return await getFromDb(PANELS_KEY(guildId), []);
}

export async function savePanels(guildId, panels) {
  await setInDb(PANELS_KEY(guildId), panels);
}

export function generatePanelId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export async function handlePanelAdd(interaction, client) {
  try {
    const panelChannel = interaction.options.getChannel('panel_channel');
    const panelMessage = interaction.options.getString('panel_message');
    const buttonLabel = interaction.options.getString('button_label') || 'Create Ticket';
    const panelTitle = interaction.options.getString('panel_title') || 'Support Tickets';
    const category = interaction.options.getChannel('category');
    const closedCategory = interaction.options.getChannel('closed_category');
    const staffRole = interaction.options.getRole('staff_role');
    const maxTickets = interaction.options.getInteger('max_tickets_per_user') || 3;
    const dmOnClose = interaction.options.getBoolean('dm_on_close') !== false;

    const panelId = generatePanelId();

    // Build and send the panel embed
    const embed = new EmbedBuilder()
      .setTitle(panelTitle)
      .setDescription(panelMessage)
      .setColor(getColor('info'));

    const button = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`create_ticket_${panelId}`)
        .setLabel(buttonLabel)
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📩'),
    );

    const sentPanel = await panelChannel.send({ embeds: [embed], components: [button] });

    // Save panel config
    const panels = await getPanels(interaction.guildId);
    panels.push({
      panelId,
      panelTitle,
      panelMessage,
      buttonLabel,
      channelId: panelChannel.id,
      messageId: sentPanel.id,
      categoryId: category?.id || null,
      closedCategoryId: closedCategory?.id || null,
      staffRoleId: staffRole?.id || null,
      maxTicketsPerUser: maxTickets,
      dmOnClose,
      createdBy: interaction.user.id,
      createdAt: new Date().toISOString(),
    });
    await savePanels(interaction.guildId, panels);

    await InteractionHelper.safeEditReply(interaction, {
      embeds: [
        successEmbed(
          '✅ Panel Created',
          `Panel \`${panelId}\` has been posted in <#${panelChannel.id}>.\n\n` +
          `**Title:** ${panelTitle}\n` +
          `**Button:** ${buttonLabel}\n` +
          `**Category:** ${category ? category.name : 'Not set'}\n` +
          `**Staff Role:** ${staffRole ? staffRole.name : 'Not set'}\n` +
          `**Max Tickets/User:** ${maxTickets}\n` +
          `**DM on Close:** ${dmOnClose ? 'Enabled' : 'Disabled'}`
        ),
      ],
    });

    logger.info('Ticket panel created', {
      panelId,
      guildId: interaction.guildId,
      channelId: panelChannel.id,
      userId: interaction.user.id,
    });
  } catch (error) {
    logger.error('Error creating ticket panel:', {
      error: error.message,
      stack: error.stack,
      guildId: interaction.guildId,
      userId: interaction.user.id,
    });
    await replyUserError(interaction, { 
      type: ErrorTypes.UNKNOWN, 
      message: `Failed to create panel: ${error.message}` 
    });
  }
}

export async function handlePanelList(interaction, client) {
  try {
    const panels = await getPanels(interaction.guildId);

    if (panels.length === 0) {
      return InteractionHelper.safeEditReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor(getColor('info'))
            .setTitle('🎫 Ticket Panels')
            .setDescription('No panels have been created yet.\nUse `/ticket panel add` to create one.'),
        ],
      });
    }

    const embed = new EmbedBuilder()
      .setColor(getColor('info'))
      .setTitle('🎫 Ticket Panels')
      .setDescription(`**${panels.length}** panel(s) configured for this server.`)
      .setTimestamp();

    for (const panel of panels) {
      embed.addFields({
        name: `${panel.panelTitle} — \`${panel.panelId}\``,
        value: [
          `**Channel:** <#${panel.channelId}>`,
          `**Button:** ${panel.buttonLabel}`,
          `**Category:** ${panel.categoryId ? `<#${panel.categoryId}>` : 'Not set'}`,
          `**Staff Role:** ${panel.staffRoleId ? `<@&${panel.staffRoleId}>` : 'Not set'}`,
          `**Max Tickets:** ${panel.maxTicketsPerUser}`,
        ].join('\n'),
        inline: false,
      });
    }

    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
  } catch (error) {
    logger.error('Error listing ticket panels:', {
      error: error.message,
      stack: error.stack,
      guildId: interaction.guildId,
      userId: interaction.user.id,
    });
    await replyUserError(interaction, { 
      type: ErrorTypes.UNKNOWN, 
      message: `Failed to list panels: ${error.message}` 
    });
  }
}

export async function handlePanelDelete(interaction, client) {
  try {
    const panelId = interaction.options.getString('panel_id');
    const panels = await getPanels(interaction.guildId);
    const index = panels.findIndex(p => p.panelId === panelId);

    if (index === -1) {
      return replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: `No panel found with ID \`${panelId}\`. Use \`/ticket panel list\` to see all panels.`,
      });
    }

    const panel = panels[index];

    // Try to delete the panel message
    try {
      const channel = interaction.guild.channels.cache.get(panel.channelId)
        || await interaction.guild.channels.fetch(panel.channelId).catch(() => null);
      if (channel && panel.messageId) {
        const msg = await channel.messages.fetch(panel.messageId).catch(() => null);
        if (msg) await msg.delete().catch(() => {});
      }
    } catch (err) {
      logger.warn(`Could not delete panel message for ${panelId}:`, err.message);
    }

    panels.splice(index, 1);
    await savePanels(interaction.guildId, panels);

    await InteractionHelper.safeEditReply(interaction, {
      embeds: [successEmbed('✅ Panel Deleted', `Panel \`${panelId}\` (${panel.panelTitle}) has been removed.`)],
    });

    logger.info('Ticket panel deleted', {
      panelId,
      guildId: interaction.guildId,
      userId: interaction.user.id,
    });
  } catch (error) {
    logger.error('Error deleting ticket panel:', {
      error: error.message,
      stack: error.stack,
      guildId: interaction.guildId,
      userId: interaction.user.id,
    });
    await replyUserError(interaction, { 
      type: ErrorTypes.UNKNOWN, 
      message: `Failed to delete panel: ${error.message}` 
    });
  }
}
