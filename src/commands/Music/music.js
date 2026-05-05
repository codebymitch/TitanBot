import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { spawn } from 'child_process';
import { errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

function searchYouTube(query) {
    const isUrl = /^https?:\/\//i.test(query);
    const searchArg = isUrl ? query : `ytsearch5:${query}`;

    return new Promise((resolve) => {
        const proc = spawn('yt-dlp', [
            '--no-playlist', '--quiet', '--no-warnings',
            '--flat-playlist',
            '-j', searchArg,
        ]);

        let out = '';
        proc.stdout.on('data', chunk => { out += chunk; });
        proc.on('close', code => {
            if (code !== 0 || !out.trim()) return resolve([]);
            try {
                const results = out.trim().split('\n').map(line => {
                    const info = JSON.parse(line);
                    const id = info.id ?? info.webpage_url?.split('v=')[1];
                    const duration = info.duration
                        ? `${Math.floor(info.duration / 60)}:${String(Math.floor(info.duration % 60)).padStart(2, '0')}`
                        : '??:??';
                    return {
                        title: info.title ?? 'Unknown',
                        url: info.webpage_url ?? `https://www.youtube.com/watch?v=${id}`,
                        duration,
                        channel: info.channel ?? info.uploader ?? 'Unknown',
                    };
                }).filter(r => r.url);
                resolve(results);
            } catch {
                resolve([]);
            }
        });
        proc.on('error', () => resolve([]));
    });
}

export default {
    data: new SlashCommandBuilder()
        .setName('music')
        .setDescription('Find music on YouTube')
        .addStringOption(o =>
            o.setName('song')
                .setDescription('Song name or YouTube URL to search for')
                .setRequired(true)
        ),

    category: 'Music',

    async execute(interaction) {
        try {
            await InteractionHelper.safeDefer(interaction);

            const query = interaction.options.getString('song');
            const results = await searchYouTube(query);

            if (!results.length) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Not Found', `No results found for: \`${query}\``)],
                });
            }

            const lines = results.map((r, i) =>
                `**${i + 1}.** [${r.title}](${r.url})\n┗ 🕒 \`${r.duration}\` • 📺 ${r.channel}`
            );

            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('🎵 Music Search Results')
                .setDescription(lines.join('\n\n'))
                .setFooter({ text: `Results for: ${query}` })
                .setTimestamp();

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        } catch (error) {
            await handleInteractionError(interaction, error, { commandName: 'music' });
        }
    },
};
