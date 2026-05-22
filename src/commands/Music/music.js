import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { buildPanel, getVoteRequired } from '../../utils/musicPanel.js';

const skipPattern = /remaster(?:ed)?|\blive\b|\bremix\b|\bkaraoke\b|\btribute\b|\bcover\b/i;

export default {
    data: new SlashCommandBuilder()
        .setName('music')
        .setDescription('Music player for voice channels')
        .addSubcommand(sub => sub
            .setName('play')
            .setDescription('Play a song in your voice channel')
            .addStringOption(o => o.setName('song').setDescription('Song name or URL').setRequired(true))
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

            await InteractionHelper.safeDefer(interaction, {});

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
                return InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed(`No results found for: \`${query}\``)] });
            }
            if (result.loadType === 'error') {
                return InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('Search failed. Try a different query.')] });
            }

            const track = result.tracks.find(t => !skipPattern.test(t.info.title)) ?? result.tracks[0];
            const wasPlaying = player.playing;
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
            const msg = await interaction.editReply(buildPanel(player, 0, required));
            client.musicPanels.set(interaction.guildId, { messageId: msg.id, textChannelId: interaction.channelId });
        }

        if (sub === 'panel') {
            const player = client.lavalink?.getPlayer(interaction.guildId);
            if (!player?.queue.current) {
                return interaction.reply({ embeds: [errorEmbed('Nothing is playing right now.')], ephemeral: true });
            }

            await InteractionHelper.safeDefer(interaction, {});
            const votes = client.musicVotes?.get(interaction.guildId)?.size ?? 0;
            const required = getVoteRequired(player, client);
            const msg = await interaction.editReply(buildPanel(player, votes, required));
            client.musicPanels.set(interaction.guildId, { messageId: msg.id, textChannelId: interaction.channelId });
        }
    },
};
