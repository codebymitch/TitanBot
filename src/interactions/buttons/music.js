import { EmbedBuilder } from 'discord.js';
import { skipSong, stopMusic, togglePause, getQueue, buildControls } from '../../services/musicService.js';

export default [
    {
        name: 'music_pause',
        async execute(interaction) {
            const queue = getQueue(interaction.guildId);
            if (!queue?.current) {
                return interaction.reply({ content: 'Nothing is playing right now.', ephemeral: true });
            }
            if (interaction.member?.voice?.channelId !== queue.voiceChannel.id) {
                return interaction.reply({ content: 'You need to be in the same voice channel.', ephemeral: true });
            }

            const nowPaused = togglePause(interaction.guildId);
            await interaction.update({ components: [buildControls(nowPaused)] });
        },
    },
    {
        name: 'music_skip',
        async execute(interaction) {
            const queue = getQueue(interaction.guildId);
            if (!queue?.current) {
                return interaction.reply({ content: 'Nothing is playing right now.', ephemeral: true });
            }
            if (interaction.member?.voice?.channelId !== queue.voiceChannel.id) {
                return interaction.reply({ content: 'You need to be in the same voice channel.', ephemeral: true });
            }

            skipSong(interaction.guildId);

            await interaction.update({
                embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('⏭ Skipped.')],
                components: [],
            });
        },
    },
    {
        name: 'music_stop',
        async execute(interaction) {
            const queue = getQueue(interaction.guildId);
            if (!queue) {
                return interaction.reply({ content: 'Nothing is playing.', ephemeral: true });
            }
            if (interaction.member?.voice?.channelId !== queue.voiceChannel.id) {
                return interaction.reply({ content: 'You need to be in the same voice channel.', ephemeral: true });
            }

            stopMusic(interaction.guildId);

            await interaction.update({
                embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('⏹ Stopped and queue cleared.')],
                components: [],
            });
        },
    },
    {
        name: 'music_queue',
        async execute(interaction) {
            const queue = getQueue(interaction.guildId);
            if (!queue) {
                return interaction.reply({ content: 'No active queue for this server.', ephemeral: true });
            }

            const lines = [];
            if (queue.current) {
                lines.push(`**Now Playing:** [${queue.current.title}](${queue.current.url}) \`${queue.current.duration}\``);
            }
            if (queue.songs.length) {
                lines.push('\n**Up Next:**');
                queue.songs.slice(0, 10).forEach((s, i) => {
                    lines.push(`**${i + 1}.** [${s.title}](${s.url}) \`${s.duration}\``);
                });
                if (queue.songs.length > 10) {
                    lines.push(`*...and ${queue.songs.length - 10} more*`);
                }
            }

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle('🎵 Music Queue')
                        .setDescription(lines.join('\n') || 'The queue is empty.')
                        .setTimestamp(),
                ],
                ephemeral: true,
            });
        },
    },
];
