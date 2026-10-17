import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { LavalinkNode, SearchPlatform, Version } from 'riffy';
import { getEnv } from '../env.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function parseBoolean(value: string | null | undefined, defaultValue = false): boolean {
    if (value === undefined || value === null || value === '') {
        return defaultValue;
    }
    return ['true', '1', 'yes'].includes(String(value).toLowerCase());
}

function parseNodesFromEnv(): LavalinkNode[] | null {
    const raw = getEnv().LAVALINK_NODES?.trim();
    if (!raw) {
        return null;
    }

    try {
        const parsed: unknown = JSON.parse(raw);
        // Node entries are passed to Riffy unvalidated, as before.
        return Array.isArray(parsed) ? (parsed as LavalinkNode[]) : null;
    } catch {
        return null;
    }
}

function parseNodesPayload(parsed: unknown): LavalinkNode[] | null {
    if (Array.isArray(parsed)) {
        return parsed as LavalinkNode[];
    }
    const nodes: unknown = (parsed as { nodes?: unknown } | null | undefined)?.nodes;
    if (Array.isArray(nodes)) {
        return nodes as LavalinkNode[];
    }
    return null;
}

function loadNodesFromFile(): LavalinkNode[] | null {
    const nodesFile = getEnv().LAVALINK_NODES_FILE?.trim()
        || path.join(projectRoot, 'lavalink', 'nodes.json');

    if (!existsSync(nodesFile)) {
        return null;
    }

    try {
        const parsed: unknown = JSON.parse(readFileSync(nodesFile, 'utf8'));
        return parseNodesPayload(parsed);
    } catch {
        return null;
    }
}

export function getLavalinkNodes(): LavalinkNode[] {
    const fromJson = parseNodesFromEnv();
    if (fromJson?.length) {
        return fromJson;
    }

    const fromFile = loadNodesFromFile();
    if (fromFile?.length) {
        return fromFile;
    }

    const env = getEnv();
    const host = env.LAVALINK_HOST || 'localhost';
    const port = Number(env.LAVALINK_PORT || 2333);
    const password = env.LAVALINK_PASSWORD || 'youshallnotpass';
    const secure = parseBoolean(env.LAVALINK_SECURE, false);

    return [{
        host,
        port,
        password,
        secure,
        name: env.LAVALINK_NAME || 'Main',
    }];
}

export interface LavalinkConfig {
    nodes: LavalinkNode[];
    defaultSearchPlatform: SearchPlatform;
    restVersion: Version;
}

export const lavalinkConfig: LavalinkConfig = {
    nodes: getLavalinkNodes(),
    defaultSearchPlatform: getEnv().LAVALINK_SEARCH_PLATFORM || 'ytmsearch',
    // Passed through unvalidated, as before.
    restVersion: (getEnv().LAVALINK_REST_VERSION || 'v4') as Version,
};

export default lavalinkConfig;
