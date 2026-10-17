import type { GuildMember } from 'discord.js';
import type { Player } from 'riffy';

export const VOICE_CHANNEL_DENIAL =
    'Du musst im selben Sprachkanal wie der Bot sein, um die Musik zu steuern.';

export function canControlMusic(member: GuildMember | null | undefined, player: Player | null | undefined): boolean {
    const memberChannel = member?.voice?.channel;
    if (!memberChannel || !player?.voiceChannel) {
        return false;
    }
    return memberChannel.id === player.voiceChannel;
}

export function requireVoiceChannel(member: GuildMember | null | undefined): boolean {
    return Boolean(member?.voice?.channel);
}
