import { SlashCommandBuilder } from 'discord.js';
import { useQueue } from 'discord-player';
import { createEmbed } from '../../utils/embeds.js';

function buildProgressBar(current, total, length = 20) {
    if (!total || total === 0) return '`─────────────────────`';
    const filled = Math.round((current / total) * length);
    const bar = '█'.repeat(filled) + '─'.repeat(Math.max(0, length - filled));
    return `\`${bar}\``;
}

function msToTime(ms) {
    if (!ms || isNaN(ms)) return '0:00';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export default {
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Show details about the currently playing track'),

    async execute(interaction) {
        const queue = useQueue(interaction.guildId);

        if (!queue?.isPlaying()) {
            return interaction.reply({
                embeds: [createEmbed({ title: '❌ Nothing Playing', description: 'Nothing is currently playing.', color: 'error' })],
                ephemeral: true,
            });
        }

        const track = queue.currentTrack;
        const timestamp = queue.node.getTimestamp();
        const currentMs = timestamp?.current?.value ?? 0;
        const totalMs = timestamp?.total?.value ?? 0;

        const progress = buildProgressBar(currentMs, totalMs);
        const elapsed = msToTime(currentMs);
        const duration = track.duration || msToTime(totalMs);

        const repeatModes = ['Off', '🔂 Track', '🔁 Queue', '♾️ Autoplay'];
        const loopMode = repeatModes[queue.repeatMode] ?? 'Off';

        const embed = createEmbed({
            title: '🎵 Now Playing',
            description: `**[${track.title}](${track.url})**\nby **${track.author}**`,
        })
            .addFields(
                { name: 'Progress', value: `${progress}\n\`${elapsed}\` / \`${duration}\``, inline: false },
                { name: 'Requested by', value: `${track.requestedBy ?? 'Unknown'}`, inline: true },
                { name: 'Volume', value: `${queue.node.volume}%`, inline: true },
                { name: 'Loop', value: loopMode, inline: true },
                { name: 'Queue', value: `${queue.tracks.size} track${queue.tracks.size !== 1 ? 's' : ''} remaining`, inline: true },
            );

        if (track.thumbnail) embed.setThumbnail(track.thumbnail);

        await interaction.reply({ embeds: [embed] });
    },
};
