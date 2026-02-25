import { PermissionFlagsBits } from 'discord.js';
import { 
  toggleEventLogging, 
  getLoggingStatus, 
  EVENT_TYPES,
  setLoggingEnabled
} from '../services/loggingService.js';
import { 
  parseEventTypeFromButton 
} from '../utils/loggingUi.js';
import { logger } from '../utils/logger.js';
import { buildLoggingStatusView } from '../commands/Config/modules/config_logging_status.js';

const LOGGING_CATEGORIES = [...new Set(Object.values(EVENT_TYPES).map((eventType) => eventType.split('.')[0]))];

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

    if (eventType === 'audit_enabled') {
      const newState = !Boolean(status.enabled);
      await setLoggingEnabled(interaction.client, interaction.guildId, newState);

      const { embed, components } = await buildLoggingStatusView(interaction, interaction.client);
      return interaction.update({
        embeds: [embed],
        components
      });
    }
    
    if (eventType === 'all') {
      
      const newState = !Object.values(status.enabledEvents).every(v => v !== false);
      const allTypes = Object.values(EVENT_TYPES);
      const categoryTypes = LOGGING_CATEGORIES.map((category) => `${category}.*`);
      
      await toggleEventLogging(interaction.client, interaction.guildId, [...allTypes, ...categoryTypes], newState);
    } else {
      
      const currentState = status.enabledEvents[eventType] !== false;
      const newState = !currentState;
      
      await toggleEventLogging(interaction.client, interaction.guildId, eventType, newState);
    }

    const { embed, components } = await buildLoggingStatusView(interaction, interaction.client);
    await interaction.update({
      embeds: [embed],
      components
    });

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
    const { embed, components } = await buildLoggingStatusView(interaction, interaction.client);

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
