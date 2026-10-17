/**
 * Standard slash-command export shape.
 *
 * Usage:
 *   export default defineSlashCommand({
 *     data: new SlashCommandBuilder()...,
 *     category: 'economy',
 *     async execute(interaction, config, client) {
 *       // throw NexoBotError / createError on failure
 *       // use replyUserError for early validation returns
 *       // do NOT wrap in try/catch — interactionCreate handles errors
 *     },
 *   });
 */

import type { Command } from '../types/index.js';

export function defineSlashCommand<T extends Command>(command: T): T {
    if (!command?.data || typeof command.execute !== 'function') {
        throw new Error('defineSlashCommand requires { data, execute }');
    }
    return command;
}
