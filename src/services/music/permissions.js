export const VOICE_CHANNEL_DENIAL =
    '🎧 لازم تكون في نفس روم الفويس اللي فيه البوت عشان تشغل أو تتحكم في الأغاني.';

export function canControlMusic(member, player) {
    const memberChannel = member?.voice?.channel;
    if (!memberChannel || !player?.voiceChannel) {
        return false;
    }
    return memberChannel.id === player.voiceChannel;
}

export function requireVoiceChannel(member) {
    return Boolean(member?.voice?.channel);
}
