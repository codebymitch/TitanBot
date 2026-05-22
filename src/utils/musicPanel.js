import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

export function fmtDuration(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    return h > 0
        ? `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
        : `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function getVoteRequired(player, client) {
    const vc = client.channels.cache.get(player.voiceChannelId);
    const humanCount = vc?.members?.filter(m => !m.user.bot)?.size ?? 1;
    return Math.min(3, Math.max(1, humanCount));
}

export function buildPanel(player, voteCount = 0, required = 3, isPaused = false) {
    const track = player.queue.current;
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🎵 Now Playing')
        .setDescription(`**[${track.info.title}](${track.info.uri})**\n📺 ${track.info.author} • 🕒 \`${fmtDuration(track.info.duration)}\``)
        .setFooter({ text: isPaused ? '⏸️ Paused' : '▶️ Playing' });

    if (track.info.artworkUrl) embed.setThumbnail(track.info.artworkUrl);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('music_pause')
            .setEmoji(isPaused ? '▶️' : '⏸️')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('music_skip')
            .setLabel(`Skip ${voteCount}/${required}`)
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('music_stop')
            .setEmoji('⏹️')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('music_addtrack')
            .setLabel('Add Track')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('music_queue')
            .setEmoji('📋')
            .setStyle(ButtonStyle.Secondary),
    );

    return { embeds: [embed], components: [row] };
}

export function buildQueueEmptyPanel() {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('music_addtrack')
            .setLabel('Add Track')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('music_stop')
            .setEmoji('⏹️')
            .setStyle(ButtonStyle.Danger),
    );
    return {
        embeds: [new EmbedBuilder().setColor(0x99AAB5).setDescription('⏸️ Queue empty — add a track to keep going!')],
        components: [row],
    };
}

export function buildEndedPanel() {
    return {
        embeds: [new EmbedBuilder().setColor(0x99AAB5).setDescription('⏹️ Stopped — see you next time!')],
        components: [],
    };
}
