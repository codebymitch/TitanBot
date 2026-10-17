/**
 * Canonical database key registry.
 * All storage keys should be built through these helpers.
 */

export const getGuildConfigKey = (guildId: string): string => `guild:${guildId}:config`;
export const getGuildBirthdaysKey = (guildId: string): string => `guild:${guildId}:birthdays`;
export const getBirthdayLeftBackupKey = (guildId: string): string => `guild:${guildId}:birthdays:left`;
export const getBirthdayTrackingKey = (guildId: string): string => `guild:${guildId}:birthdays:tracking`;

export function getTicketKey(guildId: string, channelId: string): string {
    return `guild:${guildId}:ticket:${channelId}`;
}

export function getTicketCounterKey(guildId: string): string {
    return `guild:${guildId}:ticket:counter`;
}

export function getInviteTrackingKey(guildId: string): string {
    return `guild:${guildId}:invites`;
}

export function getMemberInvitesKey(guildId: string, userId: string): string {
    return `guild:${guildId}:invites:${userId}`;
}

export function getInviteUsesKey(guildId: string, inviteCode: string): string {
    return `guild:${guildId}:invite_uses:${inviteCode}`;
}

export function getFakeAccountKey(guildId: string, userId: string): string {
    return `guild:${guildId}:fake_account:${userId}`;
}

export function getEconomyKey(guildId: string, userId: string): string {
    return `guild:${guildId}:economy:${userId}`;
}

export function getEconomyPrefix(guildId: string): string {
    return `guild:${guildId}:economy:`;
}

export function getAFKKey(guildId: string, userId: string): string {
    return `guild:${guildId}:afk:${userId}`;
}

export function getWelcomeConfigKey(guildId: string): string {
    return `guild:${guildId}:welcome`;
}

export function getLevelingKey(guildId: string): string {
    return `guild:${guildId}:leveling:config`;
}

export function getUserLevelKey(guildId: string, userId: string): string {
    return `guild:${guildId}:leveling:users:${userId}`;
}

export function getUserLevelPrefix(guildId: string): string {
    return `guild:${guildId}:leveling:users:`;
}

export function getApplicationRolesKey(guildId: string): string {
    return `guild:${guildId}:applications:roles`;
}

export function getApplicationSettingsKey(guildId: string): string {
    return `guild:${guildId}:applications:settings`;
}

export function getUserApplicationsKey(guildId: string, userId: string): string {
    return `guild:${guildId}:applications:users:${userId}`;
}

export function getApplicationKey(guildId: string, applicationId: string): string {
    return `guild:${guildId}:applications:${applicationId}`;
}

export function getApplicationsPrefix(guildId: string): string {
    return `guild:${guildId}:applications:`;
}

export function getJoinToCreateConfigKey(guildId: string): string {
    return `guild:${guildId}:jointocreate`;
}

export function getJoinToCreateChannelsKey(guildId: string): string {
    return `guild:${guildId}:jointocreate:channels`;
}

export function getWarningsKey(guildId: string, userId: string): string {
    return `guild:${guildId}:warnings:${userId}`;
}

export function getWarningsPrefix(guildId: string): string {
    return `guild:${guildId}:warnings:`;
}

export function getUserNotesKey(guildId: string, userId: string): string {
    return `guild:${guildId}:usernotes:${userId}`;
}

export function getUserNotesListKey(guildId: string): string {
    return `guild:${guildId}:usernotes:list`;
}

export function getReactionRoleKey(guildId: string, messageId: string): string {
    return `guild:${guildId}:reaction_roles:${messageId}`;
}

export function getReactionRolesPrefix(guildId: string): string {
    return `guild:${guildId}:reaction_roles:`;
}

export function getServerCountersKey(guildId: string): string {
    return `guild:${guildId}:counters`;
}

export function getGiveawayEntryKey(userId: string, giveawayId: string): string {
    return `giveaway:${userId}:${giveawayId}`;
}

export function getGiveawayLockKey(messageId: string): string {
    return `giveaway:lock:${messageId}`;
}

/**
 * Legacy key patterns mapped to canonical builders.
 * Used by migration script and read-time fallback.
 */
interface LegacyKeyResolver {
    pattern: RegExp;
    toCanonical: (match: readonly string[]) => string;
    skipIf?: (guildId: string) => boolean;
}

export const LEGACY_KEY_RESOLVERS: LegacyKeyResolver[] = [
    {
        pattern: /^economy:([^:]+):([^:]+)$/,
        toCanonical: ([, guildId, userId]) => getEconomyKey(guildId, userId),
    },
    {
        pattern: /^birthdays:([^:]+)$/,
        toCanonical: ([, guildId]) => getGuildBirthdaysKey(guildId),
    },
    {
        pattern: /^([^:]+):leveling:users:([^:]+)$/,
        toCanonical: ([, guildId, userId]) => getUserLevelKey(guildId, userId),
        skipIf: (guildId) => guildId === 'guild',
    },
    {
        pattern: /^moderation:warnings:([^:]+):([^:]+)$/,
        toCanonical: ([, guildId, userId]) => getWarningsKey(guildId, userId),
    },
    {
        pattern: /^moderation_user_notes_([^_]+)_([^_]+)$/,
        toCanonical: ([, guildId, userId]) => getUserNotesKey(guildId, userId),
    },
    {
        pattern: /^moderation_user_notes_list_([^_]+)$/,
        toCanonical: ([, guildId]) => getUserNotesListKey(guildId),
    },
    {
        pattern: /^reaction_roles:([^:]+):([^:]+)$/,
        toCanonical: ([, guildId, messageId]) => getReactionRoleKey(guildId, messageId),
    },
    {
        pattern: /^counters:([^:]+)$/,
        toCanonical: ([, guildId]) => getServerCountersKey(guildId),
    },
    {
        pattern: /^bday-role-tracking-([^:]+)$/,
        toCanonical: ([, guildId]) => getBirthdayTrackingKey(guildId),
    },
];

/**
 * Returns the canonical key for a legacy or already-canonical key.
 */
export function canonicalizeKey(key: string): string {
    if (typeof key !== 'string' || !key) {
        return key;
    }

    for (const { pattern, toCanonical, skipIf } of LEGACY_KEY_RESOLVERS) {
        const match = key.match(pattern);
        if (!match) continue;
        if (skipIf?.(match[1])) continue;
        return toCanonical(match);
    }

    return key;
}

/**
 * Returns legacy key variants that may still hold data for a canonical key.
 */
export function getLegacyVariantsForCanonical(canonicalKey: string): string[] {
    const variants: string[] = [];

    for (const { pattern, toCanonical } of LEGACY_KEY_RESOLVERS) {
        const sample = canonicalKey;
        const match = sample.match(/^guild:([^:]+):economy:([^:]+)$/);
        if (match && toCanonical(['', match[1], match[2]]) === canonicalKey) {
            variants.push(`economy:${match[1]}:${match[2]}`);
            continue;
        }

        const birthdaysMatch = sample.match(/^guild:([^:]+):birthdays$/);
        if (birthdaysMatch && toCanonical(['', birthdaysMatch[1]]) === canonicalKey) {
            variants.push(`birthdays:${birthdaysMatch[1]}`);
            continue;
        }

        const levelMatch = sample.match(/^guild:([^:]+):leveling:users:([^:]+)$/);
        if (levelMatch && toCanonical(['', levelMatch[1], levelMatch[2]]) === canonicalKey) {
            variants.push(`${levelMatch[1]}:leveling:users:${levelMatch[2]}`);
            continue;
        }

        const warningsMatch = sample.match(/^guild:([^:]+):warnings:([^:]+)$/);
        if (warningsMatch && toCanonical(['', warningsMatch[1], warningsMatch[2]]) === canonicalKey) {
            variants.push(`moderation:warnings:${warningsMatch[1]}:${warningsMatch[2]}`);
            continue;
        }

        const notesMatch = sample.match(/^guild:([^:]+):usernotes:([^:]+)$/);
        if (notesMatch && toCanonical(['', notesMatch[1], notesMatch[2]]) === canonicalKey) {
            variants.push(`moderation_user_notes_${notesMatch[1]}_${notesMatch[2]}`);
            continue;
        }

        const notesListMatch = sample.match(/^guild:([^:]+):usernotes:list$/);
        if (notesListMatch && toCanonical(['', notesListMatch[1]]) === canonicalKey) {
            variants.push(`moderation_user_notes_list_${notesListMatch[1]}`);
            continue;
        }

        const reactionMatch = sample.match(/^guild:([^:]+):reaction_roles:([^:]+)$/);
        if (reactionMatch && toCanonical(['', reactionMatch[1], reactionMatch[2]]) === canonicalKey) {
            variants.push(`reaction_roles:${reactionMatch[1]}:${reactionMatch[2]}`);
            continue;
        }

        const countersMatch = sample.match(/^guild:([^:]+):counters$/);
        if (countersMatch && toCanonical(['', countersMatch[1]]) === canonicalKey) {
            variants.push(`counters:${countersMatch[1]}`);
            continue;
        }

        const trackingMatch = sample.match(/^guild:([^:]+):birthdays:tracking$/);
        if (trackingMatch && toCanonical(['', trackingMatch[1]]) === canonicalKey) {
            variants.push(`bday-role-tracking-${trackingMatch[1]}`);
        }
    }

    return variants;
}
