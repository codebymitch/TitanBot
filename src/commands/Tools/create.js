import { ChannelType, SlashCommandBuilder } from 'discord.js';
import { isStaff } from '../../services/berryRpg.js';

export default {
  data: new SlashCommandBuilder()
    .setName('create')
    .setDescription('Create server resources.')
    .addSubcommand(sub => sub.setName('forum').setDescription('Create up to five Forums in a server category.')
      .addChannelOption(option => option.setName('category')
        .setDescription('Category where the new Forums will be placed')
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(true))
      .addStringOption(option => option.setName('names')
        .setDescription('Enter 1–5 Forum names, separated by commas or new lines')
        .setMaxLength(1000)
        .setRequired(true))),

  async execute(interaction) {
    if (!isStaff(interaction)) {
      return interaction.reply({ content: 'This command requires the Admin role.', ephemeral: true });
    }

    const category = interaction.options.getChannel('category');
    if (!interaction.guild || !category || category.type !== ChannelType.GuildCategory || category.guildId !== interaction.guildId) {
      return interaction.reply({ content: 'Choose a category from this server.', ephemeral: true });
    }

    const rawNames = interaction.options.getString('names') || '';
    const names = rawNames.split(/[,\n]/).map(name => name.trim()).filter(Boolean);
    if (names.length < 1 || names.length > 5) {
      return interaction.reply({ content: 'Enter between one and five Forum names, separated by commas or new lines.', ephemeral: true });
    }
    const tooLong = names.find(name => name.length > 100);
    if (tooLong) {
      return interaction.reply({ content: 'Each Forum name must be 100 characters or fewer.', ephemeral: true });
    }

    const normalizedNames = names.map(name => name.toLocaleLowerCase());
    if (new Set(normalizedNames).size !== normalizedNames.length) {
      return interaction.reply({ content: 'Each Forum name must be different.', ephemeral: true });
    }

    const created = [];
    const failed = [];
    for (const name of names) {
      try {
        const forum = await interaction.guild.channels.create({
          name,
          type: ChannelType.GuildForum,
          parent: category.id,
          reason: 'Created by ' + interaction.user.tag + ' using /create forum',
        });
        created.push(forum);
      } catch {
        failed.push(name);
      }
    }

    const lines = [];
    if (created.length) {
      lines.push('🏴‍☠️ Created ' + created.length + ' Forum(s) in **' + category.name + '**:');
      lines.push(created.map(forum => '• <#' + forum.id + '>').join('\n'));
    }
    if (failed.length) {
      lines.push('Could not create: ' + failed.map(name => '**' + name + '**').join(', ') + '. Check the bot’s channel permissions and the category’s capacity.');
    }

    return interaction.reply({
      content: lines.join('\n'),
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
  },
};
