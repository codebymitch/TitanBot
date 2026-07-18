import { Events, MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';
import { createEmbed } from '../utils/embeds.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { enforceCommandChannel } from '../services/commandChannelPolicy.js';

export default {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    try {
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) throw new Error(`Unknown command: ${interaction.commandName}`);
        if (!await enforceCommandChannel(interaction, command, client)) return;
        await command.execute(interaction, client);
        return;
      }
      const registry = interaction.isButton() ? client.buttons
        : interaction.isStringSelectMenu() || interaction.isRoleSelectMenu() ? client.selectMenus
          : interaction.isModalSubmit() ? client.modals : null;
      if (!registry) return;
      const [name, ...args] = interaction.customId.split(':');
      const handler = registry.get(name);
      if (handler) await handler.execute(interaction, client, args);
    } catch (error) {
      logger.error('Interaction failed', { error: error.stack || error.message, id: interaction.id });
      if (interaction.guildId) await logEvent({ client, guildId: interaction.guildId, eventType: EVENT_TYPES.COMMAND_ERROR, data: {
        title: 'שגיאה בביצוע פקודה',
        description: 'אירעה שגיאה פנימית. הפרטים הטכניים נשמרו בלוג המסוף.',
        userId: interaction.user?.id, channelId: interaction.channelId, fields: [
          { name: 'פקודה', value: interaction.commandName || interaction.customId || 'לא ידוע', inline: true },
          { name: 'משתמש', value: interaction.user ? `${interaction.user} (\`${interaction.user.id}\`)` : 'לא ידוע', inline: true },
          { name: 'ערוץ', value: interaction.channelId ? `<#${interaction.channelId}>` : '—', inline: true },
        ]
      }});
      const payload = { embeds: [createEmbed({ title: 'שגיאה', description: 'אירעה שגיאה בעת עיבוד הבקשה. נסו שוב מאוחר יותר.', color: 'error' })], flags: MessageFlags.Ephemeral };
      if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
      else await interaction.reply(payload).catch(() => {});
    }
  }
};
