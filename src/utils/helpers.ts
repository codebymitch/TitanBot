// helpers.js

import { BotConfig } from "../config/bot.js";

export interface PriorityInfo {
    name: string;
    color: string;
    emoji: string;
    label: string;
}

interface PriorityConfig {
    emoji: string;
    color: string;
    label: string;
}

export function getPriorityMap(): Record<string, PriorityInfo> {
    const priorities: Record<string, PriorityConfig> = BotConfig.tickets?.priorities || {};
    const map: Record<string, PriorityInfo> = {};

    for (const [key, config] of Object.entries(priorities)) {
        map[key] = {
            name: `${config.emoji} ${config.label.toUpperCase()}`,
            color: config.color,
            emoji: config.emoji,
            label: config.label,
        };
    }

    return map;
}

export const PRIORITY_MAP = getPriorityMap();

// Loaders accept compiled .js and source .ts (tsx dev mode), never declaration files.
export function isLoadableModuleFile(fileName: string): boolean {
    return /\.(js|ts)$/.test(fileName) && !fileName.endsWith('.d.ts');
}
