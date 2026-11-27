import { successEmbed } from '../../utils/embeds.js';
import { getGuildMusicData } from './playerStore.js';
import { applyPause, applyResume, getPlayer } from './musicActions.js';

async function notifyMusicChannel(client, channelId, title, description) {
    if (!channelId) {
        return;
    }

    const channel = client.channels.cache.get(channelId);
    if (!channel?.isTextBased?.() || typeof channel.send !== 'function') {
        return;
    }

    await channel
        .send({ embeds: [successEmbed(title, description)] })
        .catch(() => null);
}

export async function handleMusicVoiceState(client, oldState, newState) {
    if (!client.riffy) {
        return;
    }

    const guildId = newState?.guild?.id || oldState?.guild?.id;
    if (!guildId) {
        return;
    }

    const player = getPlayer(client, guildId);
    if (!player?.voiceChannel) {
        return;
    }

    const voiceChannel = client.channels.cache.get(player.voiceChannel);
    if (!voiceChannel?.members) {
        return;
    }

    const guildData = getGuildMusicData(guildId);
    const humansInChannel = voiceChannel.members.filter((member) => !member.user?.bot);
    const hasUsers = humansInChannel.size > 0;

    if (!hasUsers && player.current && player.playing && !player.paused) {
        const paused = await applyPause(client, guildId);
        if (paused) {
            guildData.autoPaused = true;
            await notifyMusicChannel(
                client,
                guildData.playerChannelId,
                'Paused',
                'Voice channel is empty. Music paused until someone joins.',
            );
        }
        return;
    }

    if (hasUsers && guildData.autoPaused) {
        if (player.paused && player.current) {
            const resumed = await applyResume(client, guildId);
            if (resumed) {
                guildData.autoPaused = false;
                await notifyMusicChannel(
                    client,
                    guildData.playerChannelId,
                    'Resumed',
                    'Someone joined the voice channel. Playback resumed.',
                );
            }
        } else {
            guildData.autoPaused = false;
        }
    }
}
