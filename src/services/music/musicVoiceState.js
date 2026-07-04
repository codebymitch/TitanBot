import { successEmbed } from '../../utils/embeds.js';
import { getGuildMusicData } from './playerStore.js';
import { applyPause, applyResume, getPlayer } from './musicActions.js';

export async function handleMusicVoiceState(client, oldState, newState) {
    if (!client.riffy) {
        return;
    }

    const guildId = newState.guild?.id || oldState.guild?.id;
    if (!guildId) {
        return;
    }

    const player = getPlayer(client, guildId);
    if (!player?.voiceChannel) {
        return;
    }

    const voiceChannel = client.channels.cache.get(player.voiceChannel);
    if (!voiceChannel) {
        return;
    }

    const guildData = getGuildMusicData(guildId);
    const humansInChannel = voiceChannel.members.filter((member) => !member.user.bot);
    const hasUsers = humansInChannel.size > 0;

    if (!hasUsers && !player.paused && player.playing) {
        guildData.wasPaused = true;
        await applyPause(client, guildId);
        if (guildData.playerChannelId) {
            const channel = client.channels.cache.get(guildData.playerChannelId);
            if (channel) {
                channel.send({ embeds: [successEmbed('Paused', 'Voice channel is empty. Music paused until someone joins.')] }).catch(() => null);
            }
        }
        return;
    }

    if (hasUsers && guildData.wasPaused && player.paused) {
        await applyResume(client, guildId);
        if (guildData.playerChannelId) {
            const channel = client.channels.cache.get(guildData.playerChannelId);
            if (channel) {
                channel.send({ embeds: [successEmbed('Resumed', 'Someone joined the voice channel. Playback resumed.')] }).catch(() => null);
            }
        }
    }
}
