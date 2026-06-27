import { SlashCommandBuilder } from 'discord.js';
import { useQueue } from 'discord-player';
import { createEmbed } from '../../utils/embeds.js';

const PAGE_SIZE = 10;

export default {
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Show the current music queue')
        .addIntegerOption(opt =>
            opt.setName('page')
                .setDescription('Page number')
                .setMinValue(1)
        ),

    async execute(interaction) {
        const queue = useQueue(interaction.guildId);

        if (!queue?.isPlaying()) {
            return interaction.reply({
                embeds: [createEmbed({ title: '📭 Queue Empty', description: 'Nothing is playing and the queue is empty.', color: 'info' })],
                ephemeral: true,
            });
        }

        const tracks = queue.tracks.toArray();
        const totalPages = Math.max(1, Math.ceil(tracks.length / PAGE_SIZE));
        const page = Math.min(interaction.options.getInteger('page') ?? 1, totalPages);
        const start = (page - 1) * PAGE_SIZE;
        const slice = tracks.slice(start, start + PAGE_SIZE);

        const current = queue.currentTrack;
        const nowPlaying = current
            ? `**Now Playing:**\n🎵 [${current.title}](${current.url}) — ${current.author} \`${current.duration}\`\n\n`
            : '';

        const queueList = slice.length
            ? slice.map((t, i) => `\`${start + i + 1}.\` [${t.title}](${t.url}) — ${t.author} \`${t.duration}\``).join('\n')
            : '*No more tracks in queue*';

        const embed = createEmbed({
            title: '📋 Queue',
            description: `${nowPlaying}**Up Next:**\n${queueList}`,
        }).setFooter({ text: `Page ${page}/${totalPages} • ${tracks.length} track${tracks.length !== 1 ? 's' : ''} in queue` });

        await interaction.reply({ embeds: [embed] });
    },
};
