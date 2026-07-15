import { MessageFlags } from 'discord.js';
import { createEmbed } from '../../../utils/embeds.js';
import { createHelpView, getVisibleHelpCommands, HELP_CATEGORIES } from '../../../commands/general/factory.js';

export default {
  name: 'general_help',
  async execute(interaction, client, args) {
    if (args[0] !== interaction.user.id) {
      return interaction.reply({
        embeds: [createEmbed({ title: 'אין גישה לתפריט', description: 'רק מי שפתח את תפריט העזרה יכול להשתמש בו.', color: 'error' })],
        flags: MessageFlags.Ephemeral
      });
    }
    const category = interaction.values[0];
    if (!HELP_CATEGORIES[category]) {
      return interaction.reply({ content: 'הקטגוריה שנבחרה אינה קיימת.', flags: MessageFlags.Ephemeral });
    }
    const commands = await getVisibleHelpCommands(interaction, client);
    return interaction.update(createHelpView(commands, category, interaction.user.id));
  }
};
