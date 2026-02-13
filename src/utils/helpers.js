import { BotConfig } from "../config/bot.js";

/**
 * Generates priority map from BotConfig for ticket priorities.
 * Maps priority level strings to their display names and colors.
 * Uses the centralized configuration from BotConfig.
 */
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

/**
 * Get a color from the configuration with a fallback
 * @param {string} path - Dot notation path to the color (e.g., 'primary', 'ticket.open')
 * @param {string} fallback - Fallback color if the path doesn't exist
 * @returns {string} The color code
 */
export function getColor(path, fallback = "#000000") {
    const parts = path.split(".");
    let current = BotConfig.embeds.colors;

    for (const part of parts) {
        if (current[part] === undefined) {
            console.warn(
                `Color path '${path}' not found in config, using fallback`,
            );
            return fallback;
        }
        current = current[part];
    }

    return typeof current === "string" ? current : fallback;
}

/**
 * Get a message from the configuration with optional replacements
 * @param {string} key - The message key (e.g., 'noPermission')
 * @param {Object} [replacements] - Key-value pairs for string replacements
 * @returns {string} The formatted message
 */
export function getMessage(key, replacements = {}) {
    let message = BotConfig.messages[key] || key;

    for (const [k, v] of Object.entries(replacements)) {
        message = message.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    }

    return message;
}

/**
 * Format a duration in milliseconds into a human-readable string
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration string (e.g., "2d 5h 30m")
 */
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


