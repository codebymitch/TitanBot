import { MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../utils/errorHandler.js';
import {
    getPlayer,
    buildQueueReply,
    destroyPlayerSession,
    setLoopMode,
    applyPause,
    applyResume,
} from '../services/music/musicActions.js';
import { refreshPlayerMessage } from '../services/music/playerHandler.js';

const MUSIC_BUTTON_IDS = {
    PAUSE: 'music_pause',
    RESUME: 'music_resume',
    SKIP: 'music_skip',
    STOP: 'music_stop',
    SHUFFLE: 'music_shuffle',
    LOOP: 'music_loop',
    VOL_DOWN: 'music_vol_down',
    VOL_UP: 'music_vol_up',
    QUEUE: 'music_queue',
    QUEUE_FIRST: 'music_queue_first',
    QUEUE_PREV: 'music_queue_prev',
    QUEUE_NEXT: 'music_queue_next',
    QUEUE_LAST: 'music_queue_last',
};

const VOICE_CHANNEL_DENIAL = 'You must be in the same voice channel as the bot to control music.';

function canControlMusic(member, player) {
    const memberVoiceId = member?.voice?.channelId;
    if (!memberVoiceId) return false;
    const botVoiceId = player?.voiceChannelId || player?.voiceChannel || member?.guild?.members?.me?.voice?.channelId;
    if (!botVoiceId) return true;
    return memberVoiceId === botVoiceId;
}

const guildMusicStore = new Map();

function getGuildMusicData(guildId) {
    if (!guildMusicStore.has(guildId)) {
        guildMusicStore.set(guildId, {
            queuePages: new Map(),
            shuffle: false,
            loop: 'none',
            volume: 100,
        });
    }
    return guildMusicStore.get(guildId);
}

async function handleMusicButton(interaction, client) {
    const player = getPlayer(client, interaction.guild.id);
    const guildData = getGuildMusicData(interaction.guild.id);
    const customId = interaction.customId;

    if (customId === MUSIC_BUTTON_IDS.QUEUE) {
        if (!player?.current) {
            return replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'Nothing is playing right now.' });
        }
        if (!canControlMusic(interaction.member, player)) {
            return replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: VOICE_CHANNEL_DENIAL });
        }
        guildData.queuePages.set(interaction.user.id, 0);
        const payload = buildQueueReply(client, interaction.guild.id, 0);
        return interaction.reply({
            embeds: payload.embeds,
            components: payload.components,
            flags: MessageFlags.Ephemeral,
        });
    }

    const queuePaginationIds = [
        MUSIC_BUTTON_IDS.QUEUE_FIRST,
        MUSIC_BUTTON_IDS.QUEUE_PREV,
        MUSIC_BUTTON_IDS.QUEUE_NEXT,
        MUSIC_BUTTON_IDS.QUEUE_LAST,
    ];

    if (queuePaginationIds.includes(customId)) {
        if (!player?.current) {
            return replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'Nothing is playing right now.' });
        }
        if (!canControlMusic(interaction.member, player)) {
            return replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: VOICE_CHANNEL_DENIAL });
        }

        await interaction.deferUpdate();
        const payload = buildQueueReply(client, interaction.guild.id, guildData.queuePages.get(interaction.user.id) || 0);
        const totalPages = payload.totalPages;
        let page = payload.page;

        switch (customId) {
            case MUSIC_BUTTON_IDS.QUEUE_FIRST:
                page = 0;
                break;
            case MUSIC_BUTTON_IDS.QUEUE_PREV:
                page = Math.max(0, page - 1);
                break;
            case MUSIC_BUTTON_IDS.QUEUE_NEXT:
                page = Math.min(totalPages - 1, page + 1);
                break;
            case MUSIC_BUTTON_IDS.QUEUE_LAST:
                page = totalPages - 1;
                break;
            default:
                break;
        }

        guildData.queuePages.set(interaction.user.id, page);
        const updated = buildQueueReply(client, interaction.guild.id, page);
        return interaction.editReply({
            embeds: updated.embeds,
            components: updated.components,
        });
    }

    if (!player) {
        return replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'No music is playing. Use `/play` first.' });
    }

    if (!canControlMusic(interaction.member, player)) {
        return replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: VOICE_CHANNEL_DENIAL });
    }

    await interaction.deferUpdate();

    try {
        switch (customId) {
            case MUSIC_BUTTON_IDS.PAUSE:
                await applyPause(client, interaction.guild.id);
                break;
            case MUSIC_BUTTON_IDS.RESUME:
                await applyResume(client, interaction.guild.id);
                break;
            case MUSIC_BUTTON_IDS.SKIP:
                if (player.loop === 'track') {
                    player.setLoop('none');
                }
                player.stop();
                break;
            case MUSIC_BUTTON_IDS.STOP:
                await destroyPlayerSession(client, interaction.guild.id, player, guildData);
                break;
            case MUSIC_BUTTON_IDS.SHUFFLE:
                if (player.queue.length > 0) {
                    player.queue.shuffle();
                    guildData.shuffle = true;
                    await refreshPlayerMessage(client, interaction.guild.id);
                }
                break;
            case MUSIC_BUTTON_IDS.LOOP: {
                const guildDataLoop = getGuildMusicData(interaction.guild.id);
                const next = guildDataLoop.loop === 'none' ? 'track' : guildDataLoop.loop === 'track' ? 'queue' : 'none';
                guildDataLoop.loop = next;
                await setLoopMode(client, interaction, next);
                break;
            }
            case MUSIC_BUTTON_IDS.VOL_DOWN:
                guildData.volume = Math.max(0, guildData.volume - 10);
                player.setVolume(guildData.volume);
                await refreshPlayerMessage(client, interaction.guild.id);
                break;
            case MUSIC_BUTTON_IDS.VOL_UP:
                guildData.volume = Math.min(100, guildData.volume + 10);
                player.setVolume(guildData.volume);
                await refreshPlayerMessage(client, interaction.guild.id);
                break;
            default:
                break;
        }
    } catch (error) {
        await handleInteractionError(interaction, error, {
            type: 'button',
            customId: interaction.customId,
            handler: 'music',
        });
    }
}

export const musicButtonHandler = {
    async execute(interaction, client) {
        try {
            if (!client.riffy) {
                return replyUserError(interaction, { type: ErrorTypes.CONFIGURATION, message: 'Music is unavailable — Lavalink is not configured.' });
            }
            await handleMusicButton(interaction, client);
        } catch (error) {
            await handleInteractionError(interaction, error, { handler: 'musicButton' });
        }
    },
};

export default musicButtonHandler;
