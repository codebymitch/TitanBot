import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function parseBoolean(value, defaultValue = false) {
    if (value === undefined || value === null || value === '') {
        return defaultValue;
    }
    return ['true', '1', 'yes'].includes(String(value).toLowerCase());
}

function parseNodesPayload(parsed) {
    if (Array.isArray(parsed)) {
        return parsed;
    }
    if (Array.isArray(parsed?.nodes)) {
        return parsed.nodes;
    }
    return null;
}

function parseNodesFromEnv() {
    const raw = process.env.LAVALINK_NODES?.trim();
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw);
        return parseNodesPayload(parsed);
    } catch {
        return null;
    }
}

function loadNodesFromFile() {
    const nodesFile = process.env.LAVALINK_NODES_FILE?.trim()
        || path.join(projectRoot, 'lavalink', 'nodes.json');

    if (!existsSync(nodesFile)) {
        return null;
    }

    try {
        const parsed = JSON.parse(readFileSync(nodesFile, 'utf8'));
        return parseNodesPayload(parsed);
    } catch {
        return null;
    }
}

function normalizeNode(node, index = 0) {
    return {
        name: node?.name || `Node-${index + 1}`,
        host: node?.host || 'localhost',
        port: Number(node?.port || 2333),
        password: node?.password || 'youshallnotpass',
        secure: parseBoolean(node?.secure, false),
    };
}

export function getLavalinkNodes() {
    const rawNodes = parseNodesFromEnv() || loadNodesFromFile();
    if (rawNodes?.length) {
        return rawNodes.map((node, idx) => normalizeNode(node, idx));
    }

    return [normalizeNode({
        name: process.env.LAVALINK_NAME || 'Main',
        host: process.env.LAVALINK_HOST || 'localhost',
        port: Number(process.env.LAVALINK_PORT || 2333),
        password: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
        secure: parseBoolean(process.env.LAVALINK_SECURE, false),
    }, 0)];
}

export const lavalinkConfig = {
    nodes: getLavalinkNodes(),
    defaultSearchPlatform: process.env.LAVALINK_SEARCH_PLATFORM || 'ytmsearch',
    restVersion: process.env.LAVALINK_REST_VERSION || 'v4',
};

export default lavalinkConfig;
