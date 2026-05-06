import {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
} from '@discordjs/voice';
import playdl from 'play-dl';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { logger } from '../utils/logger.js';

const queues = new Map();

function buildControls(paused = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('music_pause')
            .setEmoji(paused ? '▶️' : '⏸')
            .setLabel(paused ? 'Resume' : 'Pause')
            .setStyle(paused ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('music_skip')
            .setEmoji('⏭')
            .setLabel('Skip')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('music_stop')
            .setEmoji('⏹')
            .setLabel('Stop')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('music_queue')
            .setEmoji('📋')
            .setLabel('Queue')
            .setStyle(ButtonStyle.Secondary),
    );
}

function getThumb(url) {
    const m = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return m ? `https://img.youtube.com/vi/${m[1]}/mqdefault.jpg` : null;
}

class GuildQueue {
    constructor({ voiceChannel, textChannel, connection, guildId }) {
        this.guildId = guildId;
        this.voiceChannel = voiceChannel;
        this.textChannel = textChannel;
        this.connection = connection;
        this.player = createAudioPlayer();
        this.songs = [];
        this.current = null;
        this.nowPlayingMsg = null;
        this.paused = false;

        connection.subscribe(this.player);

        this.player.on(AudioPlayerStatus.Idle, () => this._advance());
        this.player.on('error', err => {
            logger.error(`Music player error in guild ${this.guildId}: ${err.message}`);
            this._advance();
        });
    }

    async _advance() {
        if (this.nowPlayingMsg) {
            this.nowPlayingMsg.edit({ components: [] }).catch(() => {});
            this.nowPlayingMsg = null;
        }

        if (!this.songs.length) {
            this.current = null;
            return;
        }

        this.current = this.songs.shift();

        try {
            const stream = await playdl.stream(this.current.url, { quality: 2 });
            const resource = createAudioResource(stream.stream, { inputType: stream.type });
            this.player.play(resource);

            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setAuthor({ name: '🎵 Now Playing' })
                .setTitle(this.current.title)
                .setURL(this.current.url)
                .addFields(
                    { name: '⏱ Duration', value: this.current.duration, inline: true },
                    { name: '📺 Channel', value: this.current.channel, inline: true },
                    { name: '👤 Requested by', value: this.current.requestedBy, inline: true },
                )
                .setTimestamp();

            const thumb = getThumb(this.current.url);
            if (thumb) embed.setThumbnail(thumb);

            this.nowPlayingMsg = await this.textChannel.send({
                embeds: [embed],
                components: [buildControls(false)],
            }).catch(() => null);
        } catch (err) {
            logger.error(`Failed to stream in guild ${this.guildId}: ${err.message}`);
            this._advance();
        }
    }
}

export function getQueue(guildId) {
    return queues.get(guildId);
}

export async function joinAndQueue(song, voiceChannel, textChannel) {
    const guildId = voiceChannel.guild.id;
    let queue = queues.get(guildId);

    if (!queue) {
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            selfDeaf: true,
        });

        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
        } catch {
            connection.destroy();
            throw new Error('Could not connect to the voice channel.');
        }

        queue = new GuildQueue({ voiceChannel, textChannel, connection, guildId });
        queues.set(guildId, queue);

        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                ]);
            } catch {
                connection.destroy();
                queues.delete(guildId);
            }
        });
    }

    const wasIdle = queue.player.state.status === AudioPlayerStatus.Idle && !queue.current;
    queue.songs.push(song);

    if (wasIdle) {
        await queue._advance();
        return { queue, queued: false };
    }

    return { queue, queued: true };
}

export function skipSong(guildId) {
    const q = queues.get(guildId);
    if (!q) return false;
    q.player.stop();
    return true;
}

export function stopMusic(guildId) {
    const q = queues.get(guildId);
    if (!q) return false;
    q.songs = [];
    q.current = null;
    if (q.nowPlayingMsg) q.nowPlayingMsg.edit({ components: [] }).catch(() => {});
    q.player.stop();
    q.connection.destroy();
    queues.delete(guildId);
    return true;
}

export function togglePause(guildId) {
    const q = queues.get(guildId);
    if (!q || !q.current) return null;
    if (q.paused) {
        q.player.unpause();
        q.paused = false;
    } else {
        q.player.pause();
        q.paused = true;
    }
    return q.paused;
}

export { buildControls };
