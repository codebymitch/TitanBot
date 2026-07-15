import { MessageFlags } from 'discord.js';
import { getConfig } from '../../community/store.js';
import { createSettingsPage, createSettingsComponents } from '../../../services/settingsOverview.js';

const pages = new Set(['overview', 'systems', 'access', 'commands', 'logging']);

export default {
  name: 'settings_page',
  async execute(interaction, client, args) {
    const [ownerId, requested, previous] = args;
    if (interaction.user.id !== ownerId) return interaction.reply({ content: 'רק מי שפתח את לוח ההגדרות יכול להשתמש בכפתורים שלו.', flags: MessageFlags.Ephemeral });
    const page = requested === 'refresh' ? previous : requested;
    if (!pages.has(page)) return interaction.reply({ content: 'עמוד ההגדרות אינו קיים.', flags: MessageFlags.Ephemeral });
    const config = await getConfig(client, interaction.guildId);
    await interaction.update({ embeds: [createSettingsPage(config, page)], components: createSettingsComponents(ownerId, page) });
  }
};
