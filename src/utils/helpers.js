// helpers.js

import { BotConfig } from "../config/bot.js";

export function getPriorityMap() {
    const priorities = BotConfig.tickets?.priorities || {};
    const map = {};

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
