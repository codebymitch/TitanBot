import { handleAiComponent } from './aiComponents.js';
import { logError } from '../utils/logger.js';

export async function routeInteraction(interaction, client) {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) {
      await interaction.reply({ content: 'Command ini belum tersedia.', ephemeral: true }).catch(() => null);
      return;
    }
    try {
      await command.execute(interaction, client);
    } catch (error) {
      logError(`command=${interaction.commandName} user=${interaction.user.id}`, error);
      const payload = { content: 'Terjadi error saat menjalankan command. Coba lagi sebentar.' };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload).catch(() => null);
      } else {
        await interaction.reply({ ...payload, ephemeral: true }).catch(() => null);
      }
    }
    return;
  }

  if (
    interaction.isButton()
    || interaction.isStringSelectMenu()
    || interaction.isChannelSelectMenu()
    || interaction.isModalSubmit()
  ) {
    await handleAiComponent(interaction);
  }
}
