import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { 
  toggleEventLogging, 
  getLoggingStatus, 
  EVENT_TYPES
} from '../services/loggingService.js';
import { 
  createStatusIndicatorButtons, 
  parseEventTypeFromButton 
} from '../utils/loggingUi.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { logger } from '../utils/logger.js';

export default {
  customIds: ['logging_toggle', 'logging_refresh_status'],

  async execute(interaction) {
    try {
      
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          content: '❌ You need **Manage Server** permissions to use this.',
          ephemeral: true
        });
      }

      if (interaction.customId === 'logging_refresh_status') {
        return await handleRefresh(interaction);
      }

      if (interaction.customId.startsWith('logging_toggle')) {
        return await handleToggle(interaction);
      }

    } catch (error) {
      logger.error('Error in logging button handler:', error);
      await interaction.reply({
        content: '❌ An error occurred while processing your request.',
        ephemeral: true
      }).catch(() => {});
    }
  }
};

async function handleToggle(interaction) {
  try {
    const eventType = parseEventTypeFromButton(interaction.customId);
    if (!eventType) {
      return interaction.reply({
        content: '❌ Invalid event type.',
        ephemeral: true
      });
    }

    const status = await getLoggingStatus(interaction.client, interaction.guildId);
    
    if (eventType === 'all') {
      
      const newState = !Object.values(status.enabledEvents).every(v => v !== false);
      const allTypes = Object.values(EVENT_TYPES);
      
      await toggleEventLogging(interaction.client, interaction.guildId, allTypes, newState);
      
      await interaction.reply({
        content: `✅ All logging has been **${newState ? 'enabled' : 'disabled'}**.`,
        ephemeral: true
      });
    } else {
      
      const currentState = status.enabledEvents[eventType] !== false;
      const newState = !currentState;
      
      await toggleEventLogging(interaction.client, interaction.guildId, eventType, newState);
      
      const displayType = eventType.endsWith('.*')
        ? `${eventType.replace('.*', '').toUpperCase()} (Category)`
        : eventType
            .split('.')
            .map((part, idx) => idx === 0 ? part.toUpperCase() : part)
            .join(' ');
      
      await interaction.reply({
        content: `✅ ${displayType} logging has been **${newState ? 'enabled' : 'disabled'}**.`,
        ephemeral: true
      });
    }

  } catch (error) {
    logger.error('Error toggling logging:', error);
    await interaction.reply({
      content: '❌ An error occurred while toggling logging.',
      ephemeral: true
    });
  }
}

async function handleRefresh(interaction) {
  try {
    const status = await getLoggingStatus(interaction.client, interaction.guildId);
    const config = await getGuildConfig(interaction.client, interaction.guildId);

    const embed = createLoggingStatusEmbed(interaction.guild, status, config);
    const buttons = createStatusIndicatorButtons(status.enabledEvents);

    const components = buttons ? [buttons] : [];

    await interaction.update({
      embeds: [embed],
      components
    });

  } catch (error) {
    logger.error('Error refreshing logging status:', error);
    await interaction.reply({
      content: '❌ An error occurred while refreshing status.',
      ephemeral: true
    });
  }
}




function createLoggingStatusEmbed(guild, status, config) {
  const embed = new EmbedBuilder()
    .setTitle('📋 Logging Configuration')
    .setColor(status.enabled ? 0x2ecc71 : 0xe74c3c)
    .setDescription(`**Status:** ${status.enabled ? '✅ **Enabled**' : '❌ **Disabled**'}`)
    .setTimestamp()
    .setFooter({ text: guild.name, iconURL: guild.iconURL() });

  
  if (status.channelId) {
    const channel = guild.channels.cache.get(status.channelId);
    embed.addFields({
      name: '📤 Log Channel',
      value: channel ? channel.toString() : `⚠️ Channel ID: ${status.channelId}`,
      inline: false
    });
  } else if (config.logChannelId) {
    const channel = guild.channels.cache.get(config.logChannelId);
    embed.addFields({
      name: '📤 Log Channel (Fallback)',
      value: channel ? channel.toString() : `⚠️ Channel ID: ${config.logChannelId}`,
      inline: false
    });
  } else {
    embed.addFields({
      name: '⚠️ Log Channel',
      value: 'Not configured',
      inline: false
    });
  }

  
  const categories = {
    'moderation': '🔨 Moderation',
    'ticket': '🎫 Tickets',
    'message': '❌ Messages',
    'role': '🏷️ Roles',
    'member': '👋 Join/Leave',
    'leveling': '📈 Leveling',
    'reactionrole': '🎭 Reaction Roles',
    'giveaway': '🎁 Giveaway',
    'counter': '📊 Counter'
  };

  let categoryStatus = '';
  for (const [category, display] of Object.entries(categories)) {
    const categoryEntries = Object.entries(status.enabledEvents)
      .filter(([key]) => key.startsWith(category));
    const isEnabled = categoryEntries.length === 0
      ? true
      : categoryEntries.some(([, value]) => value !== false);
    
    categoryStatus += `${isEnabled ? '✅' : '❌'} ${display}\n`;
  }

  if (categoryStatus) {
    embed.addFields({
      name: '📊 Event Categories',
      value: categoryStatus,
      inline: false
    });
  }

  return embed;
}
