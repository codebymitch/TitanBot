import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, formatProgressBar } from '../../utils/embeds.js';
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
        .setName('nowplaying')
        .setDescription('Show the currently playing track'),
    category: 'Music',

    async execute(interaction, guildConfig, client) {
        await InteractionHelper.safeDefer(interaction);

        const player = client.lavalink.getPlayer(interaction.guildId);
        if (!player?.queue.current) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Nothing is playing right now.')],
            });
        }

        const track = player.queue.current;
        const position = player.position;
        const duration = track.info.duration;
        const bar = formatProgressBar(position, duration, 15);

        return InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({
                title: '🎵 Now Playing',
                description: `**[${track.info.title}](${track.info.uri})**\n📺 ${track.info.author}\n\n${bar}\n\`${fmtDuration(position)} / ${fmtDuration(duration)}\``,
                color: 'blurple',
                thumbnail: track.info.artworkUrl || null,
                footer: player.paused ? '⏸️ Paused' : '▶️ Playing',
            })],
        });
    },
};
