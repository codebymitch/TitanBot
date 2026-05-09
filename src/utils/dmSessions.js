const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

// Map<targetUserId, { staffId, dmChannelId, dmMessageId, text, sentAt }>
const dmSessions = new Map();

export function storeDmSession(targetUserId, { staffId, dmChannelId, dmMessageId, text }) {
    dmSessions.set(targetUserId, { staffId, dmChannelId, dmMessageId, text, sentAt: Date.now() });
}

export function getDmSession(targetUserId) {
    const session = dmSessions.get(targetUserId);
    if (!session) return null;
    if (Date.now() - session.sentAt > SESSION_TTL_MS) {
        dmSessions.delete(targetUserId);
        return null;
    }
    return session;
}

export function updateDmSession(targetUserId, updates) {
    const session = dmSessions.get(targetUserId);
    if (session) dmSessions.set(targetUserId, { ...session, ...updates });
}
