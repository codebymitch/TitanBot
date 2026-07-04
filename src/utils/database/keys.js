export const getGuildConfigKey = (guildId) => `guild:${guildId}:config`;
export const getGuildBirthdaysKey = (guildId) => `guild:${guildId}:birthdays`;

export function getTicketKey(guildId, channelId) {
    return `guild:${guildId}:ticket:${channelId}`;
}

export function getTicketCounterKey(guildId) {
    return `guild:${guildId}:ticket:counter`;
}

export function getInviteTrackingKey(guildId) {
    return `guild:${guildId}:invites`;
}

export function getMemberInvitesKey(guildId, userId) {
    return `guild:${guildId}:invites:${userId}`;
}

export function getInviteUsesKey(guildId, inviteCode) {
    return `guild:${guildId}:invite_uses:${inviteCode}`;
}

export function getFakeAccountKey(guildId, userId) {
    return `guild:${guildId}:fake_account:${userId}`;
}

export function getEconomyKey(guildId, userId) {
    return `guild:${guildId}:economy:${userId}`;
}

export function getAFKKey(guildId, userId) {
    return `guild:${guildId}:afk:${userId}`;
}

export function getWelcomeConfigKey(guildId) {
    return `guild:${guildId}:welcome`;
}

export function getLevelingKey(guildId) {
    return `guild:${guildId}:leveling:config`;
}

export function getUserLevelKey(guildId, userId) {
    return `guild:${guildId}:leveling:users:${userId}`;
}

export function getApplicationRolesKey(guildId) {
    return `guild:${guildId}:applications:roles`;
}

export function getApplicationSettingsKey(guildId) {
    return `guild:${guildId}:applications:settings`;
}

export function getUserApplicationsKey(guildId, userId) {
    return `guild:${guildId}:applications:users:${userId}`;
}

export function getApplicationKey(guildId, applicationId) {
    return `guild:${guildId}:applications:${applicationId}`;
}

export function getJoinToCreateConfigKey(guildId) {
    return `guild:${guildId}:jointocreate`;
}

export function getJoinToCreateChannelsKey(guildId) {
    return `guild:${guildId}:jointocreate:channels`;
}
