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

const FX_META = {
    null:       { emoji: '🎵', label: 'FX: Off',     style: ButtonStyle.Secondary },
    bassboost:  { emoji: '🎸', label: 'Bass Boost',  style: ButtonStyle.Success },
    nightcore:  { emoji: '⚡', label: 'Nightcore',   style: ButtonStyle.Success },
    vaporwave:  { emoji: '🌊', label: 'Vaporwave',   style: ButtonStyle.Success },
    '8d':       { emoji: '🔄', label: '8D Audio',    style: ButtonStyle.Success },
};

export const FILTER_CYCLE = [null, 'bassboost', 'nightcore', 'vaporwave', '8d'];

export async function applyFilter(player, filterName) {
    await player.filterManager.resetFilters();
    if (filterName === 'nightcore')  await player.filterManager.toggleNightcore();
    else if (filterName === 'vaporwave') await player.filterManager.toggleVaporwave();
    else if (filterName === '8d')    await player.filterManager.toggleRotation().catch(() => {});
    else if (filterName === 'bassboost') await player.filterManager.setEQPreset('BassboostMedium');
}

export function buildPanel(player, voteCount = 0, required = 3, isPaused = false, activeFilter = null) {
    const track = player.queue.current;
    const pos = player.position ?? 0;
    const dur = track.info.duration;
    const repeatMode = player.repeatMode ?? 'off';
    const queueLen = player.queue.tracks.length;
    const vol = player.volume ?? 100;

    // 13-segment progress bar
    const pct = dur > 0 ? Math.min(pos / dur, 1) : 0;
    const filled = Math.round(pct * 13);
    const bar = '▬'.repeat(filled) + '🔘' + '▬'.repeat(13 - filled);

    const footerParts = [
        '⚠️ Beta',
        isPaused ? '⏸️ Paused' : '▶️ Playing',
        `🔊 ${vol}%`,
        queueLen ? `${queueLen} up next` : 'No queue',
    ];
    if (repeatMode === 'track') footerParts.push('🔂 Track loop');
    else if (repeatMode === 'queue') footerParts.push('🔁 Queue loop');
    if (activeFilter) footerParts.push(FX_META[activeFilter]?.label ?? '');

    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🎵 Now Playing')
        .setDescription(
            `**[${track.info.title}](${track.info.uri})**\n` +
            `📺 ${track.info.author}\n\n` +
            `${bar}\n` +
            `\`${fmtDuration(pos)}\` / \`${fmtDuration(dur)}\``
        )
        .setFooter({ text: footerParts.join(' • ') });

    if (track.info.artworkUrl) embed.setThumbnail(track.info.artworkUrl);

    const fxMeta = FX_META[activeFilter] ?? FX_META['null'];

    const row1 = new ActionRowBuilder().addComponents(
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

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('music_loop')
            .setEmoji(repeatMode === 'track' ? '🔂' : '🔁')
            .setStyle(repeatMode !== 'off' ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('music_shuffle')
            .setEmoji('🔀')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('music_restart')
            .setEmoji('⏮️')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('music_volume')
            .setEmoji('🔊')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('music_filter')
            .setEmoji(fxMeta.emoji)
            .setLabel(fxMeta.label)
            .setStyle(fxMeta.style),
    );

    return { embeds: [embed], components: [row1, row2] };
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
        embeds: [new EmbedBuilder().setColor(0x99AAB5).setDescription('⏸️ Queue empty — add a track to keep going!\n-# ⚠️ Music is in beta — may be unstable')],
        components: [row],
    };
}

export function buildEndedPanel() {
    return {
        embeds: [new EmbedBuilder().setColor(0x99AAB5).setDescription('⏹️ Stopped — see you next time!')],
        components: [],
    };
}
