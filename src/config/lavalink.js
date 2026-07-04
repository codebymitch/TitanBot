function parseBoolean(value, defaultValue = false) {
    if (value === undefined || value === null || value === '') {
        return defaultValue;
    }
    return ['true', '1', 'yes'].includes(String(value).toLowerCase());
}

function parseNodesFromEnv() {
    const raw = process.env.LAVALINK_NODES?.trim();
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

export function getLavalinkNodes() {
    const fromJson = parseNodesFromEnv();
    if (fromJson?.length) {
        return fromJson;
    }

    const host = process.env.LAVALINK_HOST || 'localhost';
    const port = Number(process.env.LAVALINK_PORT || 2333);
    const password = process.env.LAVALINK_PASSWORD || 'youshallnotpass';
    const secure = parseBoolean(process.env.LAVALINK_SECURE, false);

    return [{
        host,
        port,
        password,
        secure,
        name: process.env.LAVALINK_NAME || 'Main',
    }];
}

export const lavalinkConfig = {
    nodes: getLavalinkNodes(),
    defaultSearchPlatform: process.env.LAVALINK_SEARCH_PLATFORM || 'ytmsearch',
    restVersion: process.env.LAVALINK_REST_VERSION || 'v4',
};

export default lavalinkConfig;
