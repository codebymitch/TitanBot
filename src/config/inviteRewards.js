// inviteRewards.js — CC for inviting people to Chaos (services/inviteRewardService.js).
//
// A member who invites someone gets `reward` CC once the invited member has reached level `level`,
// sent at least `minMessages` chat messages (and, when `minStayDays` is above 0, has been in the server that
// many days). An invite doesn't count when the invited
// account is younger than `minAccountAgeDays` days (fake/alt accounts), when the member was in the
// server before (a rejoin), when they invited themselves, or when the invited member leaves before
// the reward is paid. The reward is a fixed amount: the CC event multiplier doesn't apply.
//
// Paid invites count towards the invite roles below; a member only keeps the role of their highest tier.

// The Chaos server and its welcome channel (voidWelcome.js posts the welcome there too).
export { HOME_GUILD_ID as CHAOS_GUILD_ID } from './homeGuild.js';
export const WELCOME_CHANNEL_ID = '1547305745417113700';

export const INVITE_REWARDS = {
    // 5k per invite (report #230).
    reward: 5000,
    level: 5,
    // The invited member must also have really talked: at least this many chat messages (report #167:
    // a member reached the level without taking part, e.g. with voice XP only).
    minMessages: 50,
    // No stay any more (report #223): level 5 and 50 messages are enough. Set days here to bring it back.
    minStayDays: 0,
    minAccountAgeDays: 7,
    // How often pending invites are checked, for members who reached the level before their days were up.
    checkEveryMinutes: 30,
    tiers: [
        { count: 5, name: '📨 5 Invites', color: '#f8c471' },
        { count: 10, name: '💌 10 Invites', color: '#eb984e' },
        { count: 25, name: '🏆 25 Invites', color: '#f4d03f' },
    ],
};
