import {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    StreamType,
} from '@discordjs/voice';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { spawn } from 'child_process';
import { logger } from '../utils/logger.js';

const queues = new Map();

function formatDuration(seconds) {
    if (!seconds) return '??:??';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

export function buildNowPlayingEmbed(song, isPaused = false) {
    const embed = new EmbedBuilder()
        .setColor(0xE5000E)
        .setTitle(isPaused ? '⏸️ Paused' : '🎵 Now Playing')
        .setDescription(`**[${song.title}](${song.url})**`)
        .addFields(
            { name: 'Duration', value: song.durationFormatted, inline: true },
            { name: 'Source', value: `[YouTube](${song.url})`, inline: true },
        )
        .setFooter({ text: `Requested by ${song.requestedBy ?? 'Unknown'}` })
        .setTimestamp();
    if (song.thumbnail) embed.setThumbnail(song.thumbnail);
    return embed;
}

export function buildPlayerRow(isPaused = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('music-pause')
            .setEmoji(isPaused ? '▶️' : '⏸️')
            .setLabel(isPaused ? 'Resume' : 'Pause')
            .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('music-skip')
            .setEmoji('⏭️')
            .setLabel('Skip')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('music-stop')
            .setEmoji('⏹️')
            .setLabel('Stop')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('music-shuffle')
            .setEmoji('🔀')
            .setLabel('Shuffle')
            .setStyle(ButtonStyle.Secondary),
    );
}

export function searchSong(query) {
    const isUrl = /^https?:\/\//i.test(query);
    const searchArg = isUrl ? query : `ytsearch1:${query}`;

    return new Promise((resolve) => {
        const proc = spawn('yt-dlp', [
            '--no-playlist', '--quiet', '--no-warnings',
            '-j', searchArg,
        ]);

        let out = '';
        proc.stdout.on('data', chunk => { out += chunk; });
        proc.stderr.on('data', chunk => logger.warn('yt-dlp search stderr:', chunk.toString().trim()));
        proc.on('close', code => {
            if (code !== 0 || !out.trim()) return resolve(null);
            try {
                const info = JSON.parse(out.trim());
                resolve({
                    title: info.title ?? 'Unknown',
                    url: info.webpage_url ?? `https://www.youtube.com/watch?v=${info.id}`,
                    duration: info.duration ?? 0,
                    durationFormatted: formatDuration(info.duration ?? 0),
                    thumbnail: info.thumbnail ?? null,
                });
            } catch {
                resolve(null);
            }
        });
        proc.on('error', err => {
            logger.error('yt-dlp search error:', err);
            resolve(null);
        });
    });
}

function createYtdlpStream(url) {
    const proc = spawn('yt-dlp', [
        '-f', 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio',
        '--no-playlist', '--quiet', '--no-warnings',
        '-o', '-', url,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    proc.stderr.on('data', chunk => logger.warn('yt-dlp stream stderr:', chunk.toString().trim()));
    proc.on('error', err => logger.error('yt-dlp spawn error:', err));

    return proc.stdout;
}

class GuildMusicPlayer {
    constructor(guildId) {
        this.guildId = guildId;
        this.songs = [];
        this.currentSong = null;
        this.connection = null;
        this.playerMessage = null;
        this._idleTimer = null;
        this.audioPlayer = createAudioPlayer();

        this.audioPlayer.on(AudioPlayerStatus.Idle, () => {
            if (this.songs.length > 0) {
                this._playNext();
            } else {
                this.currentSong = null;
                this._updateMessageQueueEnded();
                this._idleTimer = setTimeout(() => this.destroy(), 120_000);
            }
        });

        this.audioPlayer.on('error', (err) => {
            logger.error(`AudioPlayer error in guild ${guildId}:`, err.message);
            this._playNext();
        });
    }

    connect(voiceChannel) {
        this.connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            selfDeaf: true,
        });
        this.connection.subscribe(this.audioPlayer);
        this.connection.on(VoiceConnectionStatus.Ready, () =>
            logger.info(`Voice ready in guild ${this.guildId}`)
        );
        this.connection.on(VoiceConnectionStatus.Disconnected, () => {
            logger.warn(`Voice disconnected in guild ${this.guildId}`);
            this.destroy();
        });
        this.connection.on(VoiceConnectionStatus.Destroyed, () => queues.delete(this.guildId));
    }

    _playNext() {
        if (!this.songs.length) {
            this.currentSong = null;
            return;
        }
        this.currentSong = this.songs.shift();
        logger.info(`Streaming: "${this.currentSong.title}"`);

        try {
            const stream = createYtdlpStream(this.currentSong.url);
            const resource = createAudioResource(stream, { inputType: StreamType.Arbitrary });
            this.audioPlayer.play(resource);
            this._updateMessage();
        } catch (err) {
            logger.error(`Stream error for "${this.currentSong.title}":`, err);
            this._playNext();
        }
    }

    async addSong(song) {
        if (this._idleTimer) {
            clearTimeout(this._idleTimer);
            this._idleTimer = null;
        }
        this.songs.push(song);
        const idle = this.audioPlayer.state.status === AudioPlayerStatus.Idle;
        if (idle) {
            this._playNext();
            return true;
        }
        return false;
    }

    shuffle() {
        for (let i = this.songs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.songs[i], this.songs[j]] = [this.songs[j], this.songs[i]];
        }
    }

    skip()   { this.audioPlayer.stop(); }
    pause()  { this.audioPlayer.pause(); }
    resume() { this.audioPlayer.unpause(); }

    _updateMessage(isPaused = false) {
        if (!this.playerMessage || !this.currentSong) return;
        this.playerMessage.edit({
            embeds: [buildNowPlayingEmbed(this.currentSong, isPaused)],
            components: [buildPlayerRow(isPaused)],
        }).catch(() => {});
    }

    _updateMessageQueueEnded() {
        if (!this.playerMessage) return;
        const ended = new EmbedBuilder()
            .setColor(0x5C5C5C)
            .setTitle('⏹️ Queue Ended')
            .setDescription('No more songs in the queue.')
            .setTimestamp();
        this.playerMessage.edit({ embeds: [ended], components: [] }).catch(() => {});
        this.playerMessage = null;
    }

    destroy() {
        try { this.connection?.destroy(); } catch {}
        if (this._idleTimer) clearTimeout(this._idleTimer);
        queues.delete(this.guildId);
    }

    get isPlaying() { return this.audioPlayer.state.status === AudioPlayerStatus.Playing; }
    get isPaused()  { return this.audioPlayer.state.status === AudioPlayerStatus.Paused; }
}

export function getPlayer(guildId)         { return queues.get(guildId); }
export function getOrCreatePlayer(guildId) {
    if (!queues.has(guildId)) queues.set(guildId, new GuildMusicPlayer(guildId));
    return queues.get(guildId);
}
