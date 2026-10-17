import { once } from 'node:events';
import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import type {
    ActionRowBuilder,
    ButtonBuilder,
    EmbedBuilder,
    GuildMember,
    GuildTextBasedChannel,
    InteractionReplyOptions,
    VoiceBasedChannel,
} from 'discord.js';
import type { LoopOption, Node, Player, Riffy, Track } from 'riffy';
import type { NexoClient } from '../../types/index.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import type { NexoInteraction } from '../../utils/interactionHelper.js';
import { botHasPermission } from '../../utils/permissionGuard.js';
import { NexoBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getGuildMusicData, clearUpdateInterval } from './playerStore.js';
import type { GuildMusicData } from './playerStore.js';
import { canControlMusic, requireVoiceChannel, VOICE_CHANNEL_DENIAL } from './permissions.js';
import {
    buildNowPlayingEmbed,
    buildQueueEmbed,
    buildQueuePaginationRow,
    getQueuePageSize,
} from './musicEmbeds.js';
import type { MusicTrackInfo } from './musicEmbeds.js';
import { refreshPlayerMessage } from './playerHandler.js';

const YOUTUBE_URL_PATTERN = /(?:youtube\.com|youtu\.be)/i;
const PLAYER_CONNECT_TIMEOUT_MS = 12_000;

function getConnectedLavalinkNodes(client: NexoClient): Node[] {
    if (!client.riffy?.nodeMap) {
        return [];
    }

    return [...client.riffy.nodeMap.values()].filter((node) => node.connected);
}

export function assertLavalinkNodeAvailable(client: NexoClient): void {
    if (!getConnectedLavalinkNodes(client).length) {
        throw new NexoBotError(
            'Lavalink unavailable',
            ErrorTypes.CONFIGURATION,
            'Musik ist gerade nicht verfügbar – keine Lavalink-Nodes verbunden. Versuch es gleich noch mal oder richte deinen eigenen Lavalink-Server ein.',
        );
    }
}

function assertBotVoicePermissions(channel: VoiceBasedChannel | null | undefined): asserts channel is VoiceBasedChannel {
    if (!channel) {
        throw new NexoBotError(
            'Voice channel unavailable',
            ErrorTypes.CONFIGURATION,
            'Auf diesen Sprachkanal konnte nicht zugegriffen werden.',
        );
    }

    if (!botHasPermission(channel, [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
        throw new NexoBotError(
            'Missing voice permissions',
            ErrorTypes.PERMISSION,
            'Ich brauche die Berechtigungen **Verbinden** und **Sprechen** in deinem Sprachkanal.',
        );
    }
}

async function waitForPlayerConnection(player: Player): Promise<void> {
    if (player.connected) {
        return;
    }

    try {
        await player.connection.resolve();
    } catch {
        // Fall through to event-based wait below.
    }

    if (player.connected) {
        return;
    }

    try {
        await once(player, 'connectionRestored', {
            signal: AbortSignal.timeout(PLAYER_CONNECT_TIMEOUT_MS),
        });
    } catch {
        // Timed out waiting for Lavalink to confirm the voice session.
    }

    if (!player.connected) {
        throw new NexoBotError(
            'Voice connection failed',
            ErrorTypes.CONFIGURATION,
            'Verbindung zum Sprachkanal fehlgeschlagen. Prüfe, ob Lavalink online ist und der Bot die Berechtigungen Verbinden und Sprechen hat, und versuch es erneut.',
        );
    }
}

async function startPlayback(player: Player): Promise<void> {
    await waitForPlayerConnection(player);
    await player.play();
}

export function getPlayer(client: NexoClient, guildId: string): Player | null {
    return client.riffy?.players?.get(guildId) || null;
}

export function assertRiffyAvailable(client: NexoClient): asserts client is NexoClient & { riffy: Riffy } {
    if (!client.riffy) {
        throw new NexoBotError(
            'Lavalink not configured',
            ErrorTypes.CONFIGURATION,
            'Musik ist nicht verfügbar – Lavalink ist nicht konfiguriert.',
        );
    }
}

export function assertInVoice(member: GuildMember | null | undefined): void {
    if (!requireVoiceChannel(member)) {
        throw new NexoBotError(
            'Not in voice channel',
            ErrorTypes.USER_INPUT,
            'Du musst in einem Sprachkanal sein.',
        );
    }
}

export function assertCanControl(member: GuildMember | null | undefined, player: Player | null | undefined): void {
    if (!canControlMusic(member, player)) {
        throw new NexoBotError(
            'Wrong voice channel',
            ErrorTypes.PERMISSION,
            VOICE_CHANNEL_DENIAL,
        );
    }
}

export async function ensurePlayer(client: NexoClient, interaction: NexoInteraction): Promise<{ player: Player; guildData: GuildMusicData }> {
    assertRiffyAvailable(client);
    assertLavalinkNodeAvailable(client);
    assertInVoice(interaction.member as GuildMember);

    const guildId = interaction.guild!.id;
    const guildData = getGuildMusicData(guildId);
    let player = getPlayer(client, guildId);

    if (!player) {
        player = client.riffy.createConnection({
            guildId,
            voiceChannel: (interaction.member as GuildMember).voice.channel!.id,
            textChannel: interaction.channel!.id,
            deaf: true,
        });
        guildData.playerChannelId = interaction.channel!.id;
    }

    player.setVolume(guildData.volume);
    return { player, guildData };
}

function isDuplicateTrack(player: Player, track: Track | null | undefined): boolean {
    const uri = track?.info?.uri;
    if (!uri) {
        return false;
    }
    if (player.current?.info?.uri === uri) {
        return true;
    }
    return player.queue.some((existing) => existing.info?.uri === uri);
}

export async function joinVoiceChannel(client: NexoClient, interaction: NexoInteraction): Promise<EmbedBuilder> {
    assertRiffyAvailable(client);
    assertInVoice(interaction.member as GuildMember);

    const guildId = interaction.guild!.id;
    const guildData = getGuildMusicData(guildId);
    const channel = (interaction.member as GuildMember).voice.channel;
    assertBotVoicePermissions(channel);
    let player = getPlayer(client, guildId);

    if (player && player.voiceChannel !== channel.id) {
        try {
            player.destroy();
        } catch {
            // player may already be gone
        }
        player = null;
    }

    if (!player) {
        player = client.riffy.createConnection({
            guildId,
            voiceChannel: channel.id,
            textChannel: interaction.channel!.id,
            deaf: true,
        });
        guildData.playerChannelId = interaction.channel!.id;
    }

    player.setVolume(guildData.volume);

    return successEmbed(
        'Sprachkanal beigetreten',
        `Verbunden mit **${channel.name}**. Nutze /music play, um Musik zu starten, oder /music für die Wiedergabesteuerung.`,
    );
}

export async function playQuery(client: NexoClient, interaction: NexoInteraction, query: string): Promise<{ embed: EmbedBuilder }> {
    if (YOUTUBE_URL_PATTERN.test(query)) {
        throw new NexoBotError(
            'YouTube URL blocked',
            ErrorTypes.USER_INPUT,
            'YouTube-Links werden nicht unterstützt. Versuch es stattdessen mit einem Songnamen.',
        );
    }

    const { player, guildData } = await ensurePlayer(client, interaction);

    const result = await client.riffy!.resolve({
        query,
        requester: interaction.user,
    });

    const { loadType, tracks, playlistInfo } = result;

    if (loadType === 'playlist' || loadType === 'PLAYLIST_LOADED') {
        let added = 0;
        let skipped = 0;

        for (const track of tracks) {
            track.info.requester = interaction.user;
            if (isDuplicateTrack(player, track)) {
                skipped += 1;
                continue;
            }
            player.queue.add(track);
            added += 1;
        }

        if (!player.playing && !player.paused) {
            await startPlayback(player);
        }

        return {
            embed: successEmbed(
                'Playlist hinzugefügt',
                `**${playlistInfo?.name || 'Playlist'}**\n${added} von ${tracks.length} Titel(n) hinzugefügt.${skipped ? ` ${skipped} Duplikat(e) übersprungen.` : ''}`,
            ),
        };
    }

    if (
        loadType === 'search'
        || loadType === 'track'
        || loadType === 'SEARCH_RESULT'
        || loadType === 'TRACK_LOADED'
    ) {
        const track = tracks?.[0];
        if (!track) {
            throw new NexoBotError('No results', ErrorTypes.USER_INPUT, 'Für diese Suche wurden keine Ergebnisse gefunden.');
        }

        if (isDuplicateTrack(player, track)) {
            throw new NexoBotError(
                'Duplicate track',
                ErrorTypes.USER_INPUT,
                `**${track.info.title}** ist bereits in der Warteschlange oder läuft gerade.`,
            );
        }

        track.info.requester = interaction.user;

        const willPlayNow = !player.playing && !player.paused;
        player.queue.add(track);
        const queuePosition = player.queue.length;

        if (willPlayNow) {
            await startPlayback(player);
        }

        return {
            embed: successEmbed(
                willPlayNow ? 'Läuft gerade' : 'Titel hinzugefügt',
                willPlayNow
                    ? `**${track.info.title}**\n${track.info.author}`
                    : `**${track.info.title}**\n${track.info.author}\nPosition #${queuePosition} in der Warteschlange`,
            ),
        };
    }

    throw new NexoBotError('No results', ErrorTypes.USER_INPUT, `Keine Ergebnisse gefunden. (loadType: ${loadType})`);
}

export async function skipTrack(client: NexoClient, interaction: NexoInteraction): Promise<EmbedBuilder> {
    const player = getPlayer(client, interaction.guild!.id);
    if (!player?.current) {
        throw new NexoBotError('No player', ErrorTypes.USER_INPUT, 'Gerade läuft nichts.');
    }
    assertCanControl(interaction.member as GuildMember, player);
    const title = player.current.info?.title || 'Unbekannt';
    // Under track-loop, stop() would replay the same track. Clear it so the skip
    // advances; trackStart re-applies the stored loop mode to the next track.
    if (player.loop === 'track') {
        player.setLoop('none');
    }
    player.stop();
    return successEmbed('Übersprungen', `**${title}** übersprungen.`);
}

export async function stopPlayback(client: NexoClient, interaction: NexoInteraction): Promise<EmbedBuilder> {
    const player = getPlayer(client, interaction.guild!.id);
    if (!player) {
        throw new NexoBotError('No player', ErrorTypes.USER_INPUT, 'Kein aktiver Musik-Player.');
    }
    assertCanControl(interaction.member as GuildMember, player);

    const guildData = getGuildMusicData(interaction.guild!.id);
    const queueLength = player.queue?.length || 0;

    if (queueLength >= 5 && guildData.stopConfirmPending !== interaction.user.id) {
        guildData.stopConfirmPending = interaction.user.id;
        setTimeout(() => {
            if (guildData.stopConfirmPending === interaction.user.id) {
                guildData.stopConfirmPending = null;
            }
        }, 15000);
        return successEmbed(
            'Stoppen bestätigen',
            `Es sind **${queueLength}** Titel in der Warteschlange. Führe **/music stop** innerhalb von 15 Sekunden erneut aus, um zu bestätigen.`,
        );
    }

    guildData.stopConfirmPending = null;
    await destroyPlayerSession(client, interaction.guild!.id, player, guildData);
    return successEmbed('Gestoppt', 'Wiedergabe gestoppt und Warteschlange geleert.');
}

export async function applyPause(client: NexoClient, guildId: string): Promise<boolean> {
    const player = getPlayer(client, guildId);
    if (!player?.current || player.paused) {
        return false;
    }

    player.pause(true);
    await refreshPlayerMessage(client, guildId);
    return true;
}

export async function applyResume(client: NexoClient, guildId: string): Promise<boolean> {
    const player = getPlayer(client, guildId);
    if (!player?.current || !player.paused) {
        return false;
    }

    player.pause(false);
    await refreshPlayerMessage(client, guildId);
    return true;
}

export async function pausePlayback(client: NexoClient, interaction: NexoInteraction): Promise<EmbedBuilder> {
    const player = getPlayer(client, interaction.guild!.id);
    if (!player?.current) {
        throw new NexoBotError('No player', ErrorTypes.USER_INPUT, 'Gerade läuft nichts.');
    }
    assertCanControl(interaction.member as GuildMember, player);

    if (player.paused) {
        throw new NexoBotError('Already paused', ErrorTypes.USER_INPUT, 'Die Wiedergabe ist bereits pausiert.');
    }

    await applyPause(client, interaction.guild!.id);
    return successEmbed('Pausiert', 'Wiedergabe pausiert.');
}

export async function resumePlayback(client: NexoClient, interaction: NexoInteraction): Promise<EmbedBuilder> {
    const player = getPlayer(client, interaction.guild!.id);
    if (!player?.current) {
        throw new NexoBotError('No player', ErrorTypes.USER_INPUT, 'Gerade läuft nichts.');
    }
    assertCanControl(interaction.member as GuildMember, player);

    if (!player.paused) {
        throw new NexoBotError('Not paused', ErrorTypes.USER_INPUT, 'Die Wiedergabe ist nicht pausiert.');
    }

    await applyResume(client, interaction.guild!.id);
    return successEmbed('Fortgesetzt', 'Wiedergabe fortgesetzt.');
}

export async function shuffleQueue(client: NexoClient, interaction: NexoInteraction): Promise<EmbedBuilder> {
    const player = getPlayer(client, interaction.guild!.id);
    if (!player?.queue?.length) {
        throw new NexoBotError('Empty queue', ErrorTypes.USER_INPUT, 'Die Warteschlange ist leer.');
    }
    assertCanControl(interaction.member as GuildMember, player);
    player.queue.shuffle();
    getGuildMusicData(interaction.guild!.id).shuffle = true;
    await refreshPlayerMessage(client, interaction.guild!.id);
    return successEmbed('Gemischt', 'Die Warteschlange wurde gemischt.');
}

export async function setLoopMode(client: NexoClient, interaction: NexoInteraction, mode: LoopOption): Promise<EmbedBuilder> {
    const player = getPlayer(client, interaction.guild!.id);
    if (!player) {
        throw new NexoBotError('No player', ErrorTypes.USER_INPUT, 'Kein aktiver Musik-Player.');
    }
    assertCanControl(interaction.member as GuildMember, player);

    const guildData = getGuildMusicData(interaction.guild!.id);
    guildData.loop = mode;
    player.setLoop(mode);

    const labels: Record<string, string> = { none: 'Aus', track: 'Titel', queue: 'Warteschlange' };
    await refreshPlayerMessage(client, interaction.guild!.id);
    return successEmbed('Wiederholung aktualisiert', `Wiederholmodus auf **${labels[mode] || mode}** gesetzt.`);
}

export async function toggleLoop(client: NexoClient, interaction: NexoInteraction): Promise<EmbedBuilder> {
    const guildData = getGuildMusicData(interaction.guild!.id);
    const next = guildData.loop === 'none' ? 'track' : guildData.loop === 'track' ? 'queue' : 'none';
    return setLoopMode(client, interaction, next);
}

export async function setVolume(client: NexoClient, interaction: NexoInteraction, volume: number): Promise<EmbedBuilder> {
    const player = getPlayer(client, interaction.guild!.id);
    if (!player) {
        throw new NexoBotError('No player', ErrorTypes.USER_INPUT, 'Kein aktiver Musik-Player.');
    }
    assertCanControl(interaction.member as GuildMember, player);

    const guildData = getGuildMusicData(interaction.guild!.id);
    guildData.volume = Math.max(0, Math.min(100, volume));
    player.setVolume(guildData.volume);
    await refreshPlayerMessage(client, interaction.guild!.id);
    return successEmbed('Lautstärke aktualisiert', `Lautstärke auf **${guildData.volume}%** gesetzt.`);
}

export async function adjustVolume(client: NexoClient, interaction: NexoInteraction, delta: number): Promise<EmbedBuilder> {
    const guildData = getGuildMusicData(interaction.guild!.id);
    return setVolume(client, interaction, guildData.volume + delta);
}

export async function seekTrack(client: NexoClient, interaction: NexoInteraction, seconds: number): Promise<EmbedBuilder> {
    const player = getPlayer(client, interaction.guild!.id);
    if (!player?.current) {
        throw new NexoBotError('No player', ErrorTypes.USER_INPUT, 'Gerade läuft nichts.');
    }
    assertCanControl(interaction.member as GuildMember, player);

    const info: Partial<MusicTrackInfo> = player.current.info || {};
    if (info.isStream || info.isSeekable === false) {
        throw new NexoBotError(
            'Not seekable',
            ErrorTypes.USER_INPUT,
            'In diesem Titel kann nicht gespult werden (evtl. ein Livestream).',
        );
    }

    const position = Math.max(0, seconds * 1000);
    if (info.length && position > info.length) {
        throw new NexoBotError(
            'Seek out of range',
            ErrorTypes.USER_INPUT,
            `Du kannst bei diesem Titel höchstens bis ${Math.floor(info.length / 1000)}s spulen.`,
        );
    }

    player.seek(position);
    await refreshPlayerMessage(client, interaction.guild!.id);
    return successEmbed('Gespult', `Zu **${seconds}s** gespult.`);
}

export async function removeFromQueue(client: NexoClient, interaction: NexoInteraction, index: number): Promise<EmbedBuilder> {
    const player = getPlayer(client, interaction.guild!.id);
    if (!player?.queue?.length) {
        throw new NexoBotError('Empty queue', ErrorTypes.USER_INPUT, 'Die Warteschlange ist leer.');
    }
    assertCanControl(interaction.member as GuildMember, player);

    const queueIndex = index - 1;
    if (queueIndex < 0 || queueIndex >= player.queue.length) {
        throw new NexoBotError('Invalid index', ErrorTypes.USER_INPUT, `Ungültige Position. Die Warteschlange enthält ${player.queue.length} Titel.`);
    }

    const removed = player.queue[queueIndex];
    player.queue.remove(queueIndex);
    await refreshPlayerMessage(client, interaction.guild!.id);
    return successEmbed('Entfernt', `**${removed.info?.title || 'Titel'}** aus der Warteschlange entfernt.`);
}

export async function moveInQueue(client: NexoClient, interaction: NexoInteraction, from: number, to: number): Promise<EmbedBuilder> {
    const player = getPlayer(client, interaction.guild!.id);
    if (!player?.queue?.length) {
        throw new NexoBotError('Empty queue', ErrorTypes.USER_INPUT, 'Die Warteschlange ist leer.');
    }
    assertCanControl(interaction.member as GuildMember, player);

    const fromIndex = from - 1;
    const toIndex = to - 1;
    if (fromIndex < 0 || fromIndex >= player.queue.length || toIndex < 0 || toIndex >= player.queue.length) {
        throw new NexoBotError('Invalid index', ErrorTypes.USER_INPUT, 'Ungültige Positionen in der Warteschlange.');
    }

    const track = player.queue[fromIndex];
    player.queue.remove(fromIndex);
    player.queue.splice(toIndex, 0, track);
    await refreshPlayerMessage(client, interaction.guild!.id);
    return successEmbed('Verschoben', `**${track.info?.title || 'Titel'}** auf Position #${to} verschoben.`);
}

export async function clearQueue(client: NexoClient, interaction: NexoInteraction): Promise<EmbedBuilder> {
    const player = getPlayer(client, interaction.guild!.id);
    if (!player?.queue?.length) {
        throw new NexoBotError('Empty queue', ErrorTypes.USER_INPUT, 'Die Warteschlange ist bereits leer.');
    }
    assertCanControl(interaction.member as GuildMember, player);
    player.queue.clear();
    await refreshPlayerMessage(client, interaction.guild!.id);
    return successEmbed('Warteschlange geleert', 'Alle Titel in der Warteschlange wurden entfernt.');
}

export async function setTwentyFourSeven(client: NexoClient, interaction: NexoInteraction, enabled: boolean): Promise<EmbedBuilder> {
    const guildData = getGuildMusicData(interaction.guild!.id);
    guildData.twentyFourSeven = enabled;
    return successEmbed(
        '24/7-Modus',
        enabled
            ? '24/7-Modus aktiviert. Der Bot bleibt im Sprachkanal, wenn die Warteschlange endet.'
            : '24/7-Modus deaktiviert. Der Bot verlässt den Kanal nach 30 Sekunden Leerlauf.',
    );
}

export function buildNowPlayingReply(client: NexoClient, guildId: string): { embeds: EmbedBuilder[] } {
    const player = getPlayer(client, guildId);
    if (!player?.current) {
        throw new NexoBotError('No player', ErrorTypes.USER_INPUT, 'Gerade läuft nichts.');
    }
    const guildData = getGuildMusicData(guildId);
    return {
        embeds: [buildNowPlayingEmbed(player.current, player, guildData)],
    };
}

export function buildQueueReply(client: NexoClient, guildId: string, page = 0): {
    embeds: EmbedBuilder[];
    components: ActionRowBuilder<ButtonBuilder>[];
    page: number;
    totalPages: number;
} {
    const player = getPlayer(client, guildId);
    if (!player) {
        throw new NexoBotError('No player', ErrorTypes.USER_INPUT, 'Kein aktiver Musik-Player.');
    }

    const totalPages = Math.max(1, Math.ceil((player.queue?.length || 0) / getQueuePageSize()));
    const safePage = Math.min(Math.max(page, 0), totalPages - 1);

    return {
        embeds: [buildQueueEmbed(player.queue, player.current, safePage)],
        components: totalPages > 1 ? [buildQueuePaginationRow(safePage, totalPages)] : [],
        page: safePage,
        totalPages,
    };
}

export async function destroyPlayerSession(
    client: NexoClient,
    guildId: string,
    player: Player | null | undefined,
    guildData: GuildMusicData,
    { forceDisconnect = false }: { forceDisconnect?: boolean } = {},
): Promise<void> {
    clearUpdateInterval(guildData);
    if (guildData.idleTimeout) {
        clearTimeout(guildData.idleTimeout);
        guildData.idleTimeout = null;
    }

    guildData.previousTracks = [];
    guildData.stopConfirmPending = null;
    guildData.autoPaused = false;
    guildData.queuePages?.clear();

    if (guildData.playerMessageId && guildData.playerChannelId) {
        try {
            const channel = client.channels.cache.get(guildData.playerChannelId) as GuildTextBasedChannel | undefined;
            if (channel) {
                const msg = await channel.messages.fetch(guildData.playerMessageId);
                await msg.delete();
            }
        } catch {
            // message already deleted
        }
    }

    guildData.playerMessageId = null;
    guildData.playerChannelId = null;

    if (player) {
        player.queue.clear();
        player.stop();
        if (forceDisconnect || !guildData.twentyFourSeven) {
            player.destroy();
        }
    }
}

export async function leaveVoiceChannel(client: NexoClient, interaction: NexoInteraction): Promise<EmbedBuilder> {
    assertRiffyAvailable(client);

    const guildId = interaction.guild!.id;
    const player = getPlayer(client, guildId);
    if (!player) {
        throw new NexoBotError('No player', ErrorTypes.USER_INPUT, 'Ich bin in keinem Sprachkanal.');
    }
    assertCanControl(interaction.member as GuildMember, player);

    const channel = interaction.guild!.channels.cache.get(player.voiceChannel);
    const channelName = channel?.name || 'Sprachkanal';
    const guildData = getGuildMusicData(guildId);

    await destroyPlayerSession(client, guildId, player, guildData, { forceDisconnect: true });

    return successEmbed('Sprachkanal verlassen', `Verbindung zu **${channelName}** getrennt.`);
}

export async function replyMusicSuccess(interaction: NexoInteraction, embed: EmbedBuilder): Promise<void> {
    const options: InteractionReplyOptions = { embeds: [embed] };
    if (!interaction._isPrefixCommand) {
        options.flags = MessageFlags.Ephemeral;
    }
    await InteractionHelper.safeReply(interaction, options);
}
