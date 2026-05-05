import { SlashCommandBuilder, ChannelType, EmbedBuilder } from 'discord.js';
import { errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { getOrCreatePlayer, searchSong, buildNowPlayingEmbed, buildPlayerRow } from '../../services/musicPlayer.js';

export default {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song in a voice channel')
        .addStringOption(o => o.setName('song').setDescription('Song name or YouTube URL').setRequired(true))
        .addChannelOption(o =>
            o.setName('channel')
                .setDescription('Voice channel to join (defaults to your current VC)')
                .addChannelTypes(ChannelType.GuildVoice)
        ),

    category: 'Music',

    async execute(interaction) {
        try {
            await InteractionHelper.safeDefer(interaction);

            const query = interaction.options.getString('song');
            const channelOption = interaction.options.getChannel('channel');
            const voiceChannel = channelOption ?? interaction.member.voice.channel;

            if (!voiceChannel) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('No Voice Channel', 'Join a voice channel or specify one with the `channel` option.')],
                });
            }

            const botPerms = voiceChannel.permissionsFor(interaction.guild.members.me);
            if (!botPerms.has('Connect') || !botPerms.has('Speak')) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Missing Permissions', 'I need **Connect** and **Speak** permissions in that channel.')],
                });
            }

            const song = await searchSong(query);
            if (!song) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Not Found', `Could not find a song for: \`${query}\``)],
                });
            }

            song.requestedBy = interaction.user.username;

            const player = getOrCreatePlayer(interaction.guildId);

            if (!player.connection) {
                player.connect(voiceChannel);
            }

            const started = await player.addSong(song);

            if (started) {
                // Show the full player embed with controls
                const msg = await InteractionHelper.safeEditReply(interaction, {
                    embeds: [buildNowPlayingEmbed(song)],
                    components: [buildPlayerRow(false)],
                });
                player.playerMessage = msg;
            } else {
                // Song was queued — show a smaller confirmation
                const queued = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle('➕ Added to Queue')
                    .setDescription(`**[${song.title}](${song.url})**`)
                    .addFields(
                        { name: 'Duration', value: song.durationFormatted, inline: true },
                        { name: 'Position', value: `#${player.songs.length}`, inline: true },
                    )
                    .setFooter({ text: `Requested by ${song.requestedBy}` });
                if (song.thumbnail) queued.setThumbnail(song.thumbnail);
                await InteractionHelper.safeEditReply(interaction, { embeds: [queued] });
            }

            logger.info(`Music: ${interaction.user.tag} queued "${song.title}" in ${interaction.guild.name}`);
        } catch (error) {
            logger.error('Play command error:', error);
            await handleInteractionError(interaction, error, { commandName: 'play' });
        }
    },
};
