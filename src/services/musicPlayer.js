import {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
} from '@discordjs/voice';
import play from 'play-dl';

const queues = new Map();

function formatDuration(seconds) {
    if (!seconds) return '??:??';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

export async function searchSong(query) {
    const isUrl = play.yt_validate(query) === 'video';
    if (isUrl) {
        const info = await play.video_info(query);
        const v = info.video_details;
        return {
            title: v.title,
            url: v.url,
            duration: v.durationInSec,
            durationFormatted: formatDuration(v.durationInSec),
            thumbnail: v.thumbnails?.[0]?.url,
        };
    }
    const results = await play.search(query, { limit: 1, source: { youtube: 'video' } });
    if (!results.length) return null;
    const v = results[0];
    return {
        title: v.title,
        url: v.url,
        duration: v.durationInSec,
        durationFormatted: formatDuration(v.durationInSec),
        thumbnail: v.thumbnails?.[0]?.url,
    };
}

class GuildMusicPlayer {
    constructor(guildId) {
        this.guildId = guildId;
        this.songs = [];
        this.currentSong = null;
        this.connection = null;
        this._idleTimer = null;
        this.audioPlayer = createAudioPlayer();

        this.audioPlayer.on(AudioPlayerStatus.Idle, () => {
            if (this.songs.length > 0) {
                this._playNext();
            } else {
                this.currentSong = null;
                this._idleTimer = setTimeout(() => this.destroy(), 120_000);
            }
        });

        this.audioPlayer.on('error', () => this._playNext());
    }

    async connect(voiceChannel) {
        this.connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });
        this.connection.subscribe(this.audioPlayer);

        try {
            await entersState(this.connection, VoiceConnectionStatus.Ready, 30_000);
        } catch (err) {
            this.destroy();
            throw err;
        }

        this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
            // Silence both rejections before racing — Promise.race leaves the loser unhandled
            const p1 = entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000).catch(() => null);
            const p2 = entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000).catch(() => null);
            const result = await Promise.race([p1, p2]);
            if (result === null) this.destroy();
        });
    }

    async _playNext() {
        if (!this.songs.length) {
            this.currentSong = null;
            return;
        }
        this.currentSong = this.songs.shift();
        try {
            const stream = await play.stream(this.currentSong.url);
            const resource = createAudioResource(stream.stream, { inputType: stream.type });
            this.audioPlayer.play(resource);
        } catch {
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
            await this._playNext();
            return true;
        }
        return false;
    }

    skip()   { this.audioPlayer.stop(); }
    pause()  { this.audioPlayer.pause(); }
    resume() { this.audioPlayer.unpause(); }

    destroy() {
        try { this.connection?.destroy(); } catch {}
        queues.delete(this.guildId);
    }

    get isPlaying() { return this.audioPlayer.state.status === AudioPlayerStatus.Playing; }
    get isPaused()  { return this.audioPlayer.state.status === AudioPlayerStatus.Paused; }
}

export function getPlayer(guildId)          { return queues.get(guildId); }
export function getOrCreatePlayer(guildId)  {
    if (!queues.has(guildId)) queues.set(guildId, new GuildMusicPlayer(guildId));
    return queues.get(guildId);
}
