import { ChannelType, SlashCommandBuilder } from 'discord.js';
import { isStaff } from '../../services/berryRpg.js';

const sourceTypes = [
  ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum,
  ChannelType.PublicThread, ChannelType.AnnouncementThread, ChannelType.PrivateThread,
];
const destinationTypes = [
  ChannelType.GuildText, ChannelType.GuildAnnouncement,
  ChannelType.PublicThread, ChannelType.AnnouncementThread, ChannelType.PrivateThread,
];

export default {
  data: new SlashCommandBuilder()
    .setName('call')
    .setDescription('Set up or stop a staff-managed message relay.')
    .addStringOption(option => option.setName('action').setDescription('Relay action').setRequired(true)
      .addChoices({ name: 'Start relay', value: 'start' }, { name: 'Stop my relays', value: 'stop' }))
    .addUserOption(option => option.setName('user').setDescription('Member to ping in the destination'))
    .addChannelOption(option => option.setName('channel').setDescription('Destination text channel or thread')
      .addChannelTypes(...destinationTypes))
    .addChannelOption(option => option.setName('source').setDescription('Source channel, forum, or thread (defaults to here)')
      .addChannelTypes(...sourceTypes)),

  async execute(interaction, config, client) {
    if (!isStaff(interaction)) return interaction.reply({ content: 'Only server administrators or members with Manage Server can set up message relays.', ephemeral: true });
    const key = 'berry:calls:' + interaction.guildId;
    const links = await client.db.get(key, []);
    const action = interaction.options.getString('action');

    if (action === 'stop') {
      const remaining = links.filter(link => link.ownerId !== interaction.user.id);
      await client.db.set(key, remaining);
      return interaction.reply({ content: 'Stopped your message relay(s).', ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    const destination = interaction.options.getChannel('channel');
    const source = interaction.options.getChannel('source') || interaction.channel;
    if (!user || !destination) return interaction.reply({ content: 'Choose a member to ping and a destination channel or thread.', ephemeral: true });
    if (user.bot) return interaction.reply({ content: 'Choose a person, not a bot.', ephemeral: true });
    if (destination.guildId !== interaction.guildId || source.guildId !== interaction.guildId) return interaction.reply({ content: 'The source and destination must be in this server.', ephemeral: true });
    if (source.id === destination.id || (source.type === ChannelType.GuildForum && destination.parentId === source.id)) {
      return interaction.reply({ content: 'Choose a different destination so the relay cannot copy its own posts.', ephemeral: true });
    }

    const next = links.filter(link => !(link.ownerId === interaction.user.id && link.sourceChannelId === source.id));
    next.push({ ownerId: interaction.user.id, targetId: user.id, sourceChannelId: source.id, destinationChannelId: destination.id, createdAt: Date.now() });
    await client.db.set(key, next);
    return interaction.reply({ content: 'Relay started: your messages in ' + source.toString() + ' will be copied to ' + destination.toString() + ' and ping ' + user.toString() + '. Use /call action:stop to stop your relays.', ephemeral: true });
  }
};
