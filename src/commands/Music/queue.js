import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

function fmtDuration(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    return h > 0
        ? `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
        : `${m}:${String(s % 60).padStart(2, '0')}`;
}

export default {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Show the current music queue'),
    category: 'Music',

    async execute(interaction, guildConfig, client) {
        await InteractionHelper.safeDefer(interaction);

        const player = client.lavalink.getPlayer(interaction.guildId);
        if (!player?.queue.current) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Nothing is playing right now.')],
            });
        }

        const current = player.queue.current;
        const upcoming = player.queue.tracks.slice(0, 10);

        let description = `**Now Playing:**\n**[${current.info.title}](${current.info.uri})**\n┗ 🕒 \`${fmtDuration(current.info.duration)}\` • 📺 ${current.info.author}`;

        if (upcoming.length) {
            description += '\n\n**Up Next:**\n';
            description += upcoming.map((t, i) =>
                `**${i + 1}.** [${t.info.title}](${t.info.uri}) — \`${fmtDuration(t.info.duration)}\``
            ).join('\n');
        }

        const remaining = player.queue.tracks.length - upcoming.length;
        if (remaining > 0) description += `\n\n*...and ${remaining} more*`;

        const total = player.queue.tracks.length + 1;
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({
                title: `🎵 Queue — ${total} track${total !== 1 ? 's' : ''}`,
                description,
                color: 'blurple',
                thumbnail: current.info.artworkUrl || null,
            })],
        });
    },
};
