/**
 * Parse a storage key into routing metadata for the database layer.
 */
export function parseKey(key) {
    const fullKey = String(key ?? '');

    if (fullKey.startsWith('temp:')) {
        return { type: 'temp', fullKey };
    }
    if (fullKey.startsWith('cache:')) {
        return { type: 'cache', fullKey };
    }

    const parts = fullKey.split(':');

    if (parts[0] === 'guild' && parts[1] && parts[2] === 'config') {
        return { type: 'guild_config', guildId: parts[1], fullKey };
    }

    return { type: 'temp', fullKey };
}
