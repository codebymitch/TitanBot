import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { buildPanel, getVoteRequired } from '../../utils/musicPanel.js';
import { logger } from '../../utils/logger.js';

const skipPattern = /remaster(?:ed)?|\blive\b|\bremix\b|\bkaraoke\b|\btribute\b|\bcover\b/i;

function isPreview(track) {
    try { return Buffer.from(track.encoded, 'base64').includes('/preview/'); } catch { return false; }
}

export default {
    data: new SlashCommandBuilder()
        .setName('music')
        .setDescription('Music player for voice channels')
        .addSubcommand(sub => sub
            .setName('play')
            .setDescription('Play a song in your voice channel')
            .addStringOption(o => o.setName('song').setDescription('Song name, URL, or playlist URL').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('panel')
            .setDescription('Reshows the music control panel for the current song')
        ),

    category: 'Music',

    async execute(interaction, guildConfig, client) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'play') {
            if (!interaction.member.voice.channelId) {
                return interaction.reply({ embeds: [errorEmbed('Join a voice channel first.')], ephemeral: true });
            }

            const useableNodes = client.lavalink?.nodeManager?.leastUsedNodes();
            if (!client.lavalink || !useableNodes?.length) {
                return interaction.reply({ embeds: [errorEmbed('Music service is currently unavailable. The audio server is not connected.')], ephemeral: true });
            }

            await InteractionHelper.safeDefer(interaction, {});

            try {
                const player = client.lavalink.createPlayer({
                    guildId: interaction.guildId,
                    voiceChannelId: interaction.member.voice.channelId,
                    textChannelId: interaction.channelId,
                    selfDeaf: true,
                    selfMute: false,
                    volume: 80,
                });

                await player.connect();

                const rawQuery = interaction.options.getString('song');
                const isUrl = /^https?:\/\//i.test(rawQuery);
                const query = isUrl ? rawQuery : `scsearch:${rawQuery}`;
                const result = await player.search({ query }, interaction.user);

                if (!result.tracks.length || result.loadType === 'empty') {
                    return InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed(`No results found for: \`${query}\``)] });
                }
                if (result.loadType === 'error') {
                    return InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Search failed. Try a different query.')] });
                }

                const wasPlaying = player.playing;

                // ── Playlist ──────────────────────────────────────────────
                if (result.loadType === 'playlist') {
                    const tracks = result.tracks;
                    await player.queue.add(tracks);
                    if (!player.playing) await player.play({ paused: false });

                    const playlistName = result.playlist?.name ?? 'Playlist';

                    if (wasPlaying) {
                        return InteractionHelper.safeEditReply(interaction, {
                            embeds: [createEmbed({
                                title: '✅ Playlist Added to Queue',
                                description: `**${playlistName}**\n📋 ${tracks.length} tracks added`,
                                color: 'blurple',
                                thumbnail: tracks[0]?.info?.artworkUrl ?? null,
                            })],
                        });
                    }

                    const required = getVoteRequired(player, client);
                    const msg = await interaction.editReply(buildPanel(player, 0, required, false, null));
                    client.musicPanels.set(interaction.guildId, { messageId: msg.id, textChannelId: interaction.channelId, voiceChannelId: interaction.member.voice.channelId, requesterId: interaction.user.id, isPaused: false, activeFilter: null });
                    await interaction.followUp({ content: `✅ Loaded **${playlistName}** — ${tracks.length} tracks queued!\n⚠️ **Music is in beta** — playback may be unstable.`, ephemeral: true });
                    return;
                }

                // ── Single track ──────────────────────────────────────────
                const track = result.tracks.find(t => !skipPattern.test(t.info.title) && !isPreview(t))
                    ?? result.tracks.find(t => !isPreview(t))
                    ?? result.tracks[0];
                await player.queue.add(track);
                if (!player.playing) await player.play({ paused: false });

                if (wasPlaying) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [createEmbed({
                            title: '✅ Added to Queue',
                            description: `**[${track.info.title}](${track.info.uri})**\n📺 ${track.info.author}`,
                            color: 'blurple',
                            thumbnail: track.info.artworkUrl || null,
                        })],
                    });
                }

                const required = getVoteRequired(player, client);
                const msg = await interaction.editReply(buildPanel(player, 0, required, false, null));
                client.musicPanels.set(interaction.guildId, { messageId: msg.id, textChannelId: interaction.channelId, voiceChannelId: interaction.member.voice.channelId, requesterId: interaction.user.id, isPaused: false, activeFilter: null });
                await interaction.followUp({ content: '⚠️ **Music is in beta** — playback may be unstable or stop unexpectedly.', ephemeral: true });
            } catch (err) {
                logger.error('[music play] Lavalink error:', { message: err.message, stack: err.stack });
                return InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Music service error. The audio server may be unavailable — try again in a moment.')] });
            }
        }

        if (sub === 'panel') {
            const player = client.lavalink?.getPlayer(interaction.guildId);
            if (!player?.queue.current) {
                return interaction.reply({ embeds: [errorEmbed('Nothing is playing right now.')], ephemeral: true });
            }

            await InteractionHelper.safeDefer(interaction, {});
            const votes = client.musicVotes?.get(interaction.guildId)?.size ?? 0;
            const required = getVoteRequired(player, client);
            const msg = await interaction.editReply(buildPanel(player, votes, required, false, null));
            client.musicPanels.set(interaction.guildId, { messageId: msg.id, textChannelId: interaction.channelId, voiceChannelId: interaction.member.voice.channelId ?? null, activeFilter: null });
        }
    },
};
