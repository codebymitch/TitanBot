import { BotConfig } from "../config/bot.js";
import { logger } from "./logger.js";






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







export function getColor(path, fallback = "#000000") {
    const parts = path.split(".");
    let current = BotConfig.embeds.colors;

    for (const part of parts) {
        if (current[part] === undefined) {
            logger.warn(`Color path '${path}' not found in config, using fallback`);
            return fallback;
        }
        current = current[part];
    }

    return typeof current === "string" ? current : fallback;
}







export function getMessage(key, replacements = {}) {
    let message = BotConfig.messages[key] || key;

    for (const [k, v] of Object.entries(replacements)) {
        message = message.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    }

    return message;
}






export function formatDuration(ms) {
    if (ms < 0) return "0s";
    
    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / (1000 * 60)) % 60;
    const hours = Math.floor(ms / (1000 * 60 * 60)) % 24;
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

    return parts.join(" ");
}

export const PRIORITY_MAP = getPriorityMap();


