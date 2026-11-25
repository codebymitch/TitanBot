import { SlashCommandBuilder } from 'discord.js';
import { buildLootPanel, isForumPost } from '../../services/berryLootPosts.js';

export default {
  data: new SlashCommandBuilder()
    .setName('checkloot')
    .setDescription('Check a forum post for chests and claim loot.')
    .addChannelOption(option => option.setName('location').setDescription('Select a Forum post to check').setRequired(true)),

  async execute(interaction, config, client) {
    const location = interaction.options.getChannel('location');
    if (!location) {
      return interaction.reply({ content: 'Select a Forum post in the location option.', ephemeral: true });
    }
    if (!await isForumPost(location)) {
      return interaction.reply({ content: 'Choose a post inside a Forum channel.', ephemeral: true });
    }

    const loot = await client.db.get('berry:loot:' + interaction.guildId, { posts: {} });
    const post = loot?.posts?.[location.id];
    if (!post) {
      return interaction.reply({ content: '📭 There are no chests configured in **' + location.name + '**. The search is over.', ephemeral: true });
    }

    const panel = buildLootPanel(location.id, post);
    return interaction.reply({ ...panel, ephemeral: true });
  }
};
