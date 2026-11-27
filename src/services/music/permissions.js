export const VOICE_CHANNEL_DENIAL =
    'You need to be in the same voice channel as the bot to use music controls.';

function getMemberVoiceChannelId(member) {
    return member?.voice?.channelId ?? member?.voice?.channel?.id ?? null;
}

function getPlayerVoiceChannelId(player) {
    return player?.voiceChannel?.id ?? player?.voiceChannel ?? null;
}

export function canControlMusic(member, player) {
    const memberChannelId = getMemberVoiceChannelId(member);
    const playerChannelId = getPlayerVoiceChannelId(player);

    if (!memberChannelId || !playerChannelId) {
        return false;
    }

    return memberChannelId === playerChannelId;
}

export function requireVoiceChannel(member) {
    return Boolean(getMemberVoiceChannelId(member));
}
