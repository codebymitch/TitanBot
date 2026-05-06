import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import playdl from 'play-dl';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { errorEmbed } from '../../utils/embeds.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { joinAndQueue, buildControls } from '../../services/musicService.js';

function getThumb(url) {
    const m = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return m ? `https://img.youtube.com/vi/${m[1]}/mqdefault.jpg` : null;
}

export default {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song in your voice channel')
        .addStringOption(o =>
            o.setName('song')
                .setDescription('Song name or YouTube URL')
                .setRequired(true)
        ),

    category: 'Music',

    async execute(interaction) {
        try {
            await InteractionHelper.safeDefer(interaction);

            const voiceChannel = interaction.member?.voice?.channel;
            if (!voiceChannel) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Not in Voice', 'You need to be in a voice channel to play music.')],
                });
            }

            const query = interaction.options.getString('song');
            let song;

            if (/^https?:\/\//i.test(query)) {
                const info = await playdl.video_info(query).catch(() => null);
                if (!info) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('Invalid URL', 'Could not load that YouTube URL.')],
                    });
                }
                const v = info.video_details;
                song = {
                    title: v.title,
                    url: query,
                    duration: v.durationRaw,
                    channel: v.channel?.name ?? 'Unknown',
                    requestedBy: interaction.user.toString(),
                };
            } else {
                const results = await playdl.search(query, { limit: 1, source: { youtube: 'video' } });
                if (!results.length) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('Not Found', `No results for: \`${query}\``)],
                    });
                }
                const v = results[0];
                song = {
                    title: v.title,
                    url: v.url,
                    duration: v.durationRaw,
                    channel: v.channel?.name ?? 'Unknown',
                    requestedBy: interaction.user.toString(),
                };
            }

            const { queue, queued } = await joinAndQueue(song, voiceChannel, interaction.channel);

            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setAuthor({ name: queued ? '📋 Added to Queue' : '🎵 Now Playing' })
                .setTitle(song.title)
                .setURL(song.url)
                .addFields(
                    { name: '⏱ Duration', value: song.duration, inline: true },
                    { name: '📺 Channel', value: song.channel, inline: true },
                    { name: '👤 Requested by', value: song.requestedBy, inline: true },
                )
                .setTimestamp();

            if (queued) {
                embed.addFields({ name: '🔢 Position in Queue', value: `#${queue.songs.length}`, inline: true });
            }

            const thumb = getThumb(song.url);
            if (thumb) embed.setThumbnail(thumb);

            const msg = await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed],
                components: [buildControls(false)],
            });

            if (!queued && queue) {
                queue.nowPlayingMsg = msg;
            }
        } catch (error) {
            await handleInteractionError(interaction, error, { commandName: 'play' });
        }
    },
};
