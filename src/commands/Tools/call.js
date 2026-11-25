import { ChannelType, SlashCommandBuilder } from 'discord.js';
import { isStaff } from '../../services/berryRpg.js';

function canUseTextChannel(channel) {
  return Boolean(channel && channel.guildId && !channel.isDMBased?.()
    && (channel.type === ChannelType.GuildForum || channel.isTextBased?.()));
}

export default {
  data: new SlashCommandBuilder()
    .setName('call')
    .setDescription('Set up or stop a staff-managed message relay.')
    .addStringOption(option => option.setName('action').setDescription('Relay action').setRequired(true)
      .addChoices({ name: 'Start relay', value: 'start' }, { name: 'Stop my relays', value: 'stop' }))
    .addUserOption(option => option.setName('user').setDescription('Member to ping in the destination'))
    .addChannelOption(option => option.setName('channel').setDescription('Choose any server channel, Forum, or thread'))
    .addChannelOption(option => option.setName('source').setDescription('Choose any server channel, Forum, or thread (defaults to here)')),

  async execute(interaction, config, client) {
    if (!isStaff(interaction)) return interaction.reply({ content: 'This command requires the Admin role.', ephemeral: true });
    const key = 'berry:calls:' + interaction.guildId;
    const links = await client.db.get(key, []);
    const action = interaction.options.getString('action');

    if (action === 'stop') {
      const remaining = links.filter(link => link.ownerId !== interaction.user.id);
      await client.db.set(key, remaining);
      return interaction.reply({ content: 'Stopped your message relay(s).', ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    const selectedDestination = interaction.options.getChannel('channel');
    const source = interaction.options.getChannel('source') || interaction.channel;
    if (!user || !selectedDestination) return interaction.reply({ content: 'Choose a member to ping and a destination channel or thread.', ephemeral: true });
    if (user.bot) return interaction.reply({ content: 'Choose a person, not a bot.', ephemeral: true });
    if (selectedDestination.guildId !== interaction.guildId || source.guildId !== interaction.guildId) return interaction.reply({ content: 'The source and destination must be in this server.', ephemeral: true });
    if (!canUseTextChannel(source)) return interaction.reply({ content: 'Choose a text channel, Forum, or thread as the source. Voice channels and categories cannot be relayed.', ephemeral: true });
    if (!canUseTextChannel(selectedDestination)) return interaction.reply({ content: 'Choose a text channel, Forum, or thread as the destination. Voice channels and categories cannot receive relayed text.', ephemeral: true });
    const destinationIsChildThread = selectedDestination.isThread?.() && selectedDestination.parentId === source.id;
    if (source.id === selectedDestination.id || destinationIsChildThread
      || (source.isThread?.() && source.parentId === selectedDestination.id)
      || (selectedDestination.type === ChannelType.GuildForum && selectedDestination.id === source.parentId)) {
      return interaction.reply({ content: 'Choose a different destination so the relay cannot copy its own posts.', ephemeral: true });
    }

    let destination = selectedDestination;
    if (selectedDestination.type === ChannelType.GuildForum) {
      destination = await selectedDestination.threads.create({
        name: ('Relay for ' + user.username).slice(0, 100),
        message: { content: '⚓ Message relay for ' + user.toString() + ' is active.', allowedMentions: { parse: [] } },
        reason: 'Create a destination thread for a staff-configured message relay',
      }).catch(() => null);
      if (!destination) return interaction.reply({ content: 'I could not create a relay thread in that Forum. Check the bot’s Forum permissions.', ephemeral: true });
    }

    const next = links.filter(link => !(link.ownerId === interaction.user.id && link.sourceChannelId === source.id));
    next.push({ ownerId: interaction.user.id, targetId: user.id, sourceChannelId: source.id, destinationChannelId: destination.id, createdAt: Date.now() });
    await client.db.set(key, next);
    return interaction.reply({ content: 'Relay started: your messages in ' + source.toString() + ' will be copied to ' + destination.toString() + ' and ping ' + user.toString() + '. Use /call action:stop to stop your relays.', ephemeral: true });
  }
};
