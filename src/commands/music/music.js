import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { useQueue } from 'discord-player';

// Helper to check queue exists
function getQueue(interaction) {
  const queue = useQueue(interaction.guild.id);
  return queue;
}

export const skip = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current song'),
  category: 'music',
  async execute(interaction) {
    const queue = getQueue(interaction);
    if (!queue || !queue.isPlaying()) {
      return interaction.reply({ content: '❌ No music is playing!', ephemeral: true });
    }
    const track = queue.currentTrack;
    queue.node.skip();
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x1DB954)
          .setDescription(`⏭️ Skipped **${track?.title || 'current track'}**`)
      ]
    });
  },
};

export const stop = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop music and clear the queue'),
  category: 'music',
  async execute(interaction) {
    const queue = getQueue(interaction);
    if (!queue || !queue.isPlaying()) {
      return interaction.reply({ content: '❌ No music is playing!', ephemeral: true });
    }
    queue.delete();
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xE74C3C)
          .setDescription('⏹️ Stopped music and cleared the queue.')
      ]
    });
  },
};

export const pause = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause the current song'),
  category: 'music',
  async execute(interaction) {
    const queue = getQueue(interaction);
    if (!queue || !queue.isPlaying()) {
      return interaction.reply({ content: '❌ No music is playing!', ephemeral: true });
    }
    if (queue.node.isPaused()) {
      return interaction.reply({ content: '⏸️ Music is already paused!', ephemeral: true });
    }
    queue.node.pause();
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xF39C12)
          .setDescription('⏸️ Paused the music.')
      ]
    });
  },
};

export const resume = {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume the paused song'),
  category: 'music',
  async execute(interaction) {
    const queue = getQueue(interaction);
    if (!queue) {
      return interaction.reply({ content: '❌ No music in queue!', ephemeral: true });
    }
    if (!queue.node.isPaused()) {
      return interaction.reply({ content: '▶️ Music is already playing!', ephemeral: true });
    }
    queue.node.resume();
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x1DB954)
          .setDescription('▶️ Resumed the music.')
      ]
    });
  },
};

export const queue = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show the current music queue'),
  category: 'music',
  async execute(interaction) {
    const q = getQueue(interaction);
    if (!q || !q.isPlaying()) {
      return interaction.reply({ content: '❌ No music is playing!', ephemeral: true });
    }

    const current = q.currentTrack;
    const tracks = q.tracks.toArray().slice(0, 10);

    const embed = new EmbedBuilder()
      .setColor(0x1DB954)
      .setTitle('🎵 Music Queue')
      .addFields({
        name: '▶️ Now Playing',
        value: `**${current?.title}** by ${current?.author} (${current?.duration})`,
        inline: false,
      });

    if (tracks.length > 0) {
      embed.addFields({
        name: '📋 Up Next',
        value: tracks.map((t, i) => `\`${i + 1}.\` **${t.title}** by ${t.author} (${t.duration})`).join('\n'),
        inline: false,
      });
    } else {
      embed.addFields({ name: '📋 Up Next', value: 'Nothing in queue', inline: false });
    }

    embed.setFooter({ text: `${q.tracks.size} song(s) in queue` });

    await interaction.reply({ embeds: [embed] });
  },
};

export const nowplaying = {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Show the currently playing song'),
  category: 'music',
  async execute(interaction) {
    const queue = getQueue(interaction);
    if (!queue || !queue.isPlaying()) {
      return interaction.reply({ content: '❌ No music is playing!', ephemeral: true });
    }

    const track = queue.currentTrack;
    const progress = queue.node.createProgressBar();

    const embed = new EmbedBuilder()
      .setColor(0x1DB954)
      .setTitle('🎵 Now Playing')
      .setDescription(`**[${track.title}](${track.url})**`)
      .addFields(
        { name: 'Artist', value: track.author || 'Unknown', inline: true },
        { name: 'Duration', value: track.duration || 'Unknown', inline: true },
        { name: 'Requested by', value: `<@${track.requestedBy?.id || interaction.user.id}>`, inline: true },
        { name: 'Progress', value: progress || 'Unknown', inline: false },
      )
      .setThumbnail(track.thumbnail)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

export const volume = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Set the music volume')
    .addIntegerOption(option =>
      option.setName('level')
        .setDescription('Volume level (1-100)')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),
  category: 'music',
  async execute(interaction) {
    const queue = getQueue(interaction);
    if (!queue || !queue.isPlaying()) {
      return interaction.reply({ content: '❌ No music is playing!', ephemeral: true });
    }
    const level = interaction.options.getInteger('level');
    queue.node.setVolume(level);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x1DB954)
          .setDescription(`🔊 Volume set to **${level}%**`)
      ]
    });
  },
};

export const shuffle = {
  data: new SlashCommandBuilder()
    .setName('shuffle')
    .setDescription('Shuffle the music queue'),
  category: 'music',
  async execute(interaction) {
    const queue = getQueue(interaction);
    if (!queue || queue.tracks.size < 2) {
      return interaction.reply({ content: '❌ Not enough songs in the queue to shuffle!', ephemeral: true });
    }
    queue.tracks.shuffle();
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x1DB954)
          .setDescription('🔀 Queue shuffled!')
      ]
    });
  },
};

// Default export for the command loader (exports all as array)
export default [
  skip, stop, pause, resume, queue, nowplaying, volume, shuffle
];
