import { Events, MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';
import { createEmbed } from '../utils/embeds.js';

export default {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    try {
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) throw new Error(`Unknown command: ${interaction.commandName}`);
        await command.execute(interaction, client);
        return;
      }
      const registry = interaction.isButton() ? client.buttons
        : interaction.isStringSelectMenu() ? client.selectMenus
          : interaction.isModalSubmit() ? client.modals : null;
      if (!registry) return;
      const [name, ...args] = interaction.customId.split(':');
      const handler = registry.get(name);
      if (handler) await handler.execute(interaction, client, args);
    } catch (error) {
      logger.error('Interaction failed', { error: error.stack || error.message, id: interaction.id });
      const payload = { embeds: [createEmbed({ title: 'שגיאה', description: 'אירעה שגיאה בעת עיבוד הבקשה. נסו שוב מאוחר יותר.', color: 'error' })], flags: MessageFlags.Ephemeral };
      if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
      else await interaction.reply(payload).catch(() => {});
    }
  }
};
