const RSN_INDICATORS = ['🟢', '🔹', '🔸', '⭐', '⚔️', '🛡️'];

function normalizeUsername(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim().replace(/\s+/g, ' ');
    return trimmed.length > 0 ? trimmed : null;
}

function resolveUsernameCandidates(rawLinks) {
    if (!rawLinks) {
        return [];
    }

    if (Array.isArray(rawLinks)) {
        return rawLinks;
    }

    if (typeof rawLinks === 'string') {
        return [rawLinks];
    }

    if (typeof rawLinks === 'object') {
        if (Array.isArray(rawLinks.usernames)) {
            return rawLinks.usernames;
        }

        if (Array.isArray(rawLinks.rsns)) {
            return rawLinks.rsns;
        }

        if (Array.isArray(rawLinks.accounts)) {
            return rawLinks.accounts;
        }

        if (rawLinks.primaryUsername || rawLinks.primaryRsn) {
            return [rawLinks.primaryUsername, rawLinks.primaryRsn].filter(Boolean);
        }
    }

    return [];
}

export function normalizeLinkedOsrsUsernames(rawLinks) {
    const deduped = new Map();

    for (const value of resolveUsernameCandidates(rawLinks)) {
        const normalized = normalizeUsername(value);
        if (!normalized) {
            continue;
        }

        const key = normalized.toLowerCase();
        if (!deduped.has(key)) {
            deduped.set(key, normalized);
        }
    }

    return [...deduped.values()];
}

export function formatProfileCurrency(amount) {
    const value = Number(amount) || 0;
    const absolute = Math.abs(value);

    let formatted;
    if (absolute >= 1_000_000_000) {
        formatted = `${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
    } else if (absolute >= 1_000_000) {
        formatted = `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    } else if (absolute >= 1_000) {
        formatted = `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
    } else {
        formatted = value.toLocaleString('en-US');
    }

    return `${formatted} gp`;
}

export function buildLinkedRsnsValue(usernames) {
    if (!Array.isArray(usernames) || usernames.length === 0) {
        return 'No linked OSRS accounts yet.';
    }

    return usernames
        .map((username, index) => `${RSN_INDICATORS[index % RSN_INDICATORS.length]} ${username}`)
        .join('\n');
}

export function buildFightStats(linkedUsernames, statsByUsername = {}, recentEvents = []) {
    const linkedSet = new Set((linkedUsernames || []).map((username) => username.toLowerCase()));
    let wins = 0;
    let losses = 0;

    for (const username of linkedUsernames || []) {
        const key = username.toLowerCase();
        const stats = statsByUsername[key] || {};
        wins += Number(stats.kills) || 0;
        losses += Number(stats.deaths) || 0;
    }

    let streakType = null;
    let streakCount = 0;

    for (const event of recentEvents) {
        const killer = normalizeUsername(event?.killer)?.toLowerCase();
        const victim = normalizeUsername(event?.victim)?.toLowerCase();

        if (!killer || !victim || (!linkedSet.has(killer) && !linkedSet.has(victim))) {
            continue;
        }

        const eventResult = linkedSet.has(killer) ? 'win' : 'loss';
        if (!streakType) {
            streakType = eventResult;
            streakCount = 1;
            continue;
        }

        if (streakType !== eventResult) {
            break;
        }

        streakCount += 1;
    }

    const totalFights = wins + losses;
    const winRate = totalFights > 0 ? Math.round((wins / totalFights) * 100) : 0;

    return {
        totalFights,
        wins,
        losses,
        winRate,
        currentStreak: formatStreakLabel(streakType, streakCount),
    };
}

function formatStreakLabel(streakType, streakCount) {
    if (!streakType) {
        return 'None';
    }

    return `${streakType === 'win' ? 'Win' : 'Loss'} ${streakCount}`;
}

function resolveStakeAmount(event) {
    const candidateKeys = ['amount', 'stake', 'wager', 'value'];

    for (const key of candidateKeys) {
        const amount = Number(event?.[key]);
        if (Number.isFinite(amount) && amount > 0) {
            return amount;
        }
    }

    return null;
}

function formatStakeSuffix(event, didWin) {
    const amount = resolveStakeAmount(event);
    if (!Number.isFinite(amount) || amount <= 0) {
        return '';
    }

    const formatted = formatProfileCurrency(amount).replace(/ gp$/, '');
    return didWin ? ` for ${formatted}` : ` (${formatted})`;
}

export function buildRecentActivityRows(recentEvents, linkedUsernames, rsnToUserId = {}, limit = 5) {
    const linkedSet = new Set((linkedUsernames || []).map((username) => username.toLowerCase()));

    return (recentEvents || [])
        .filter((event) => {
            const killer = normalizeUsername(event?.killer)?.toLowerCase();
            const victim = normalizeUsername(event?.victim)?.toLowerCase();
            return Boolean(killer && victim && (linkedSet.has(killer) || linkedSet.has(victim)));
        })
        .slice(0, limit)
        .map((event) => {
            const killer = normalizeUsername(event.killer);
            const victim = normalizeUsername(event.victim);
            const didWin = linkedSet.has(killer.toLowerCase());
            const opponent = didWin ? victim : killer;
            const opponentUserId = rsnToUserId[opponent.toLowerCase()];
            const opponentLabel = opponentUserId ? `<@${opponentUserId}>` : `**${opponent}**`;
            const timestamp = event.timestamp
                ? `<t:${Math.floor(new Date(event.timestamp).getTime() / 1000)}:R>`
                : 'Unknown time';

            if (didWin) {
                return `✅ Won against ${opponentLabel}${formatStakeSuffix(event, true)} • ${timestamp}`;
            }

            return `❌ Lost to ${opponentLabel}${formatStakeSuffix(event, false)} • ${timestamp}`;
        });
}
