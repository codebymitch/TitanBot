import type { GuildTextBasedChannel, VoiceBasedChannel, VoiceState } from 'discord.js';
import type { NexoClient } from '../../types/index.js';
import { successEmbed } from '../../utils/embeds.js';
import { getGuildMusicData } from './playerStore.js';
import { applyPause, applyResume, getPlayer } from './musicActions.js';

export async function handleMusicVoiceState(client: NexoClient, oldState: VoiceState, newState: VoiceState): Promise<void> {
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

    const voiceChannel = client.channels.cache.get(player.voiceChannel) as VoiceBasedChannel | undefined;
    if (!voiceChannel) {
        return;
    }

    const guildData = getGuildMusicData(guildId);
    const humansInChannel = voiceChannel.members.filter((member) => !member.user.bot);
    const hasUsers = humansInChannel.size > 0;

    if (!hasUsers && !player.paused && player.playing) {
        guildData.autoPaused = true;
        await applyPause(client, guildId);
        if (guildData.playerChannelId) {
            const channel = client.channels.cache.get(guildData.playerChannelId) as GuildTextBasedChannel | undefined;
            if (channel) {
                channel.send({ embeds: [successEmbed('Pausiert', 'Der Sprachkanal ist leer. Die Musik ist pausiert, bis jemand beitritt.')] }).catch(() => null);
            }
        }
        return;
    }

    if (hasUsers && guildData.autoPaused && player.paused) {
        await applyResume(client, guildId);
        guildData.autoPaused = false;
        if (guildData.playerChannelId) {
            const channel = client.channels.cache.get(guildData.playerChannelId) as GuildTextBasedChannel | undefined;
            if (channel) {
                channel.send({ embeds: [successEmbed('Fortgesetzt', 'Jemand ist dem Sprachkanal beigetreten. Die Wiedergabe läuft weiter.')] }).catch(() => null);
            }
        }
    }
}
