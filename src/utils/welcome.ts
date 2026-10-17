// welcome.js

import { logger } from './logger.js';

const DEFAULT_TEMPLATES = {
    welcome: 'Willkommen {user} auf {server}!',
    goodbye: '{user.tag} hat den Server verlassen.'
};

/** Fields read from a (possibly partial) discord.js User. */
interface WelcomeFormatUser {
    toString?(): string;
    tag?: string | null;
    username?: string | null;
    discriminator?: string | null;
    id?: string;
}

/** Fields read from a discord.js Guild. */
interface WelcomeFormatGuild {
    name?: string;
    id?: string;
    memberCount?: number;
}

export interface WelcomeFormatData {
    user?: WelcomeFormatUser | null;
    guild?: WelcomeFormatGuild | null;
    [key: string]: unknown;
}

function replaceAll(message: string, token: string, value: unknown): string {
    if (value === undefined || value === null) {
        return message;
    }
    return message.split(token).join(String(value));
}

export function truncateForEmbedField(value: unknown, maxLength = 1024): string {
    const text = String(value ?? '').trim();
    if (!text) {
        return '—';
    }
    return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

export function formatWelcomeMessage(message: unknown, data: WelcomeFormatData | null | undefined): string {
    
    if (typeof message !== 'string') return '';
    if (!message) return '';
    if (!data || typeof data !== 'object') return message;

    const user = data?.user;
    const guild = data?.guild;

    if (!user || typeof user !== 'object') {
        logger.warn('Invalid user object passed to formatWelcomeMessage');
    }
    if (!guild || typeof guild !== 'object') {
        logger.warn('Invalid guild object passed to formatWelcomeMessage');
    }

    const tokens: Record<string, string> = {
        '{user}': user?.toString?.() || 'Nutzer',
        '{user.mention}': user?.toString?.() || 'Nutzer',
        '{user.tag}': user?.tag || 'Unbekannt#0000',
        '{user.username}': user?.username || 'Unbekannt',
        '{username}': user?.username || 'Unbekannt',
        '{user.discriminator}': user?.discriminator || '0000',
        '{user.id}': user?.id || 'unknown',
        '{server}': guild?.name || 'Server',
        '{server.name}': guild?.name || 'Server',
        '{guild.name}': guild?.name || 'Server',
        '{guild.id}': guild?.id || 'unknown',
        '{guild.memberCount}': guild?.memberCount?.toString?.() || '0',
        '{memberCount}': guild?.memberCount?.toString?.() || '0',
        '{membercount}': guild?.memberCount?.toString?.() || '0'
    };

    let result = message;
    for (const [token, value] of Object.entries(tokens)) {
        if (value === undefined || value === null) continue;
        result = replaceAll(result, token, String(value));
    }

    return result;
}

export function getDefaultWelcomeMessage(): string {
    return DEFAULT_TEMPLATES.welcome;
}

export function getDefaultGoodbyeMessage(): string {
    return DEFAULT_TEMPLATES.goodbye;
}
