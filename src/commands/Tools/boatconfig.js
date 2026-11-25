import { ChannelType, SlashCommandBuilder } from 'discord.js';
import { isStaff, loadJourneyConfig, saveConfig, cleanName } from '../../services/berryRpg.js';

export default {
  data: new SlashCommandBuilder()
    .setName('boatconfig')
    .setDescription('Manage islands, travel time, and manual departure review.')
    .addStringOption(option => option.setName('action').setDescription('What to update').setRequired(true)
      .addChoices(
        { name: 'List islands and settings', value: 'list' },
        { name: 'Add island', value: 'add' },
        { name: 'Remove island', value: 'remove' },
        { name: 'Set journey duration', value: 'duration' },
        { name: 'Set manual review channel', value: 'manual' },
        { name: 'Turn off manual review', value: 'auto' }
      ))
    .addStringOption(option => option.setName('island').setDescription('Island name').setMaxLength(80))
    .addIntegerOption(option => option.setName('minutes').setDescription('Trip duration (1 to 3 minutes)').setMinValue(1).setMaxValue(3))
    .addChannelOption(option => option.setName('channel').setDescription('Channel for manual departure requests').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),

  async execute(interaction, config, client) {
    if (!isStaff(interaction)) return interaction.reply({ content: 'Only server administrators or members with Manage Server can change travel settings.', ephemeral: true });
    const cfg = await loadJourneyConfig(client, interaction.guildId);
    const action = interaction.options.getString('action');
    const island = cleanName(interaction.options.getString('island'));

    if (action === 'list') {
      return interaction.reply({ content: '🗺️ **Travel setup**\nIslands: ' + cfg.islands.join(', ') + '\nJourney length: ' + cfg.durationMinutes + ' minutes\nManual review: ' + (cfg.manualChannelId ? '<#' + cfg.manualChannelId + '>' : 'off'), ephemeral: true });
    }
    if (action === 'add') {
      if (!island) return interaction.reply({ content: 'Enter an island name.', ephemeral: true });
      if (!cfg.islands.some(name => name.toLowerCase() === island.toLowerCase())) cfg.islands.push(island);
    } else if (action === 'remove') {
      if (!island) return interaction.reply({ content: 'Enter the island to remove.', ephemeral: true });
      if (cfg.islands.length <= 2) return interaction.reply({ content: 'Keep at least two islands in the travel list.', ephemeral: true });
      cfg.islands = cfg.islands.filter(name => name.toLowerCase() !== island.toLowerCase());
    } else if (action === 'duration') {
      const minutes = interaction.options.getInteger('minutes');
      if (!minutes) return interaction.reply({ content: 'Set a journey length between 1 and 3 minutes.', ephemeral: true });
      cfg.durationMinutes = minutes;
    } else if (action === 'manual') {
      const channel = interaction.options.getChannel('channel');
      if (!channel) return interaction.reply({ content: 'Choose a channel for manual departure requests.', ephemeral: true });
      cfg.manualChannelId = channel.id;
    } else if (action === 'auto') {
      cfg.manualChannelId = null;
    }

    await saveConfig(client, 'journey-config', interaction.guildId, cfg);
    return interaction.reply({ content: 'Travel settings updated. New journeys will use the new settings.', ephemeral: true });
  }
};
