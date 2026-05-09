const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

// Map<targetUserId, { staffId, dmChannelId, dmMessageId, text, threadId, sentAt }>
const dmSessions = new Map();

// Reverse lookup: threadId -> targetUserId
const threadToTarget = new Map();

export function storeDmSession(targetUserId, { staffId, dmChannelId, dmMessageId, text, threadId }) {
    dmSessions.set(targetUserId, { staffId, dmChannelId, dmMessageId, text, threadId, sentAt: Date.now() });
    if (threadId) threadToTarget.set(threadId, targetUserId);
}

export function getDmSession(targetUserId) {
    const session = dmSessions.get(targetUserId);
    if (!session) return null;
    if (Date.now() - session.sentAt > SESSION_TTL_MS) {
        if (session.threadId) threadToTarget.delete(session.threadId);
        dmSessions.delete(targetUserId);
        return null;
    }
    return session;
}

export function updateDmSession(targetUserId, updates) {
    const session = dmSessions.get(targetUserId);
    if (!session) return;
    if (updates.threadId && session.threadId) threadToTarget.delete(session.threadId);
    const updated = { ...session, ...updates };
    dmSessions.set(targetUserId, updated);
    if (updated.threadId) threadToTarget.set(updated.threadId, targetUserId);
}

export function getTargetByThread(threadId) {
    const targetId = threadToTarget.get(threadId);
    if (!targetId) return null;
    const session = getDmSession(targetId);
    if (!session) {
        threadToTarget.delete(threadId);
        return null;
    }
    return { targetId, session };
}
