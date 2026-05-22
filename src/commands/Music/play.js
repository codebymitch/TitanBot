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
        .setName('play')
        .setDescription('Play music in your voice channel')
        .addStringOption(o =>
            o.setName('song').setDescription('Song name or YouTube URL').setRequired(true)
        ),
    category: 'Music',

    async execute(interaction, guildConfig, client) {
        await InteractionHelper.safeDefer(interaction);

        if (!interaction.member.voice.channelId) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Join a voice channel first.')],
            });
        }

        const player = client.lavalink.createPlayer({
            guildId: interaction.guildId,
            voiceChannelId: interaction.member.voice.channelId,
            textChannelId: interaction.channelId,
            selfDeaf: true,
            selfMute: false,
            volume: 80,
        });

        await player.connect();

        const query = interaction.options.getString('song');
        const result = await player.search({ query }, interaction.user);

        if (!result.tracks.length || result.loadType === 'empty') {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(`No results found for: \`${query}\``)],
            });
        }

        if (result.loadType === 'error') {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Search failed. Try a different query.')],
            });
        }

        const track = result.tracks[0];
        await player.queue.add(track);
        const wasPlaying = player.playing;
        if (!player.playing) await player.play({ paused: false });

        return InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({
                title: wasPlaying ? '🎵 Added to Queue' : '🎵 Now Playing',
                description: `**[${track.info.title}](${track.info.uri})**\n┗ 🕒 \`${fmtDuration(track.info.duration)}\` • 📺 ${track.info.author}`,
                color: 'blurple',
                thumbnail: track.info.artworkUrl || null,
            })],
        });
    },
};
