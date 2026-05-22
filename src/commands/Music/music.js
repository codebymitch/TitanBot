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
        .setName('music')
        .setDescription('Music player for voice channels')
        .addSubcommand(sub => sub
            .setName('play')
            .setDescription('Play a song in your voice channel')
            .addStringOption(o => o.setName('song').setDescription('Song name or YouTube URL').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('skip')
            .setDescription('Skip the current track')
        )
        .addSubcommand(sub => sub
            .setName('stop')
            .setDescription('Stop music and disconnect the bot')
        )
        .addSubcommand(sub => sub
            .setName('pause')
            .setDescription('Pause or resume the current track')
        )
        .addSubcommand(sub => sub
            .setName('queue')
            .setDescription('Show the current music queue')
        )
        .addSubcommand(sub => sub
            .setName('nowplaying')
            .setDescription('Show the currently playing track')
        ),

    category: 'Music',

    async execute(interaction, guildConfig, client) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'play') {
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
        }

        if (sub === 'skip') {
            await InteractionHelper.safeDefer(interaction);
            const player = client.lavalink.getPlayer(interaction.guildId);
            if (!player?.playing) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Nothing is playing right now.')],
                });
            }
            const skipped = player.queue.current;
            await player.skip();
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({
                    title: '⏭️ Skipped',
                    description: skipped ? `**[${skipped.info.title}](${skipped.info.uri})**` : 'Track skipped.',
                    color: 'blurple',
                })],
            });
        }

        if (sub === 'stop') {
            await InteractionHelper.safeDefer(interaction);
            const player = client.lavalink.getPlayer(interaction.guildId);
            if (!player) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('The bot is not in a voice channel.')],
                });
            }
            await player.destroy();
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({
                    title: '⏹️ Stopped',
                    description: 'Music stopped and queue cleared.',
                    color: 'blurple',
                })],
            });
        }

        if (sub === 'pause') {
            await InteractionHelper.safeDefer(interaction);
            const player = client.lavalink.getPlayer(interaction.guildId);
            if (!player?.queue.current) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Nothing is playing right now.')],
                });
            }
            await player.pause(!player.paused);
            const isPaused = player.paused;
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({
                    title: isPaused ? '⏸️ Paused' : '▶️ Resumed',
                    description: `**[${player.queue.current.info.title}](${player.queue.current.info.uri})**`,
                    color: 'blurple',
                })],
            });
        }

        if (sub === 'queue') {
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
        }

        if (sub === 'nowplaying') {
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
        }
    },
};
