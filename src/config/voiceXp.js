// voiceXp.js — XP for time in voice channels (src/services/leveling/voiceXp.js).
//
// Every minute, each member in a voice channel who can talk (not muted or deafened) and isn't alone
// (someone else in the channel can hear them) gets XP into the same level as chat, and a minute on
// `top voice`. The server's AFK channel never counts, and the leveling dashboard's ignored channels,
// ignored roles and blacklist apply like they do for chat. The level multiplier applies too.

export const VOICE_XP = {
    // XP per minute, a random amount in this range. Chat gives 15–25 per message at most once a minute,
    // so voice is a bit less than someone chatting non-stop.
    perMinute: { min: 8, max: 12 },
};
