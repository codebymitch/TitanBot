import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { getOrCreatePlayer, searchSong } from '../../services/musicPlayer.js';

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

            song.requestedBy = interaction.user.tag;

            const player = getOrCreatePlayer(interaction.guildId);

            if (!player.connection) {
                await player.connect(voiceChannel);
            }

            const started = await player.addSong(song);

            const embed = createEmbed({
                title: started ? '▶️ Now Playing' : '➕ Added to Queue',
                description: `**[${song.title}](${song.url})**`,
                color: 'success',
            }).addFields(
                { name: '⏱️ Duration', value: song.durationFormatted, inline: true },
                { name: '🎙️ Channel', value: voiceChannel.name, inline: true },
                { name: '👤 Requested by', value: interaction.user.tag, inline: true },
            );
            if (song.thumbnail) embed.setThumbnail(song.thumbnail);

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            logger.info(`Music: ${interaction.user.tag} queued "${song.title}" in ${interaction.guild.name}`);
        } catch (error) {
            logger.error('Play command error:', error);
            await handleInteractionError(interaction, error, { commandName: 'play' });
        }
    },
};
