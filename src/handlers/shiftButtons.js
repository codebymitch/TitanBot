import { MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';
import { handleInteractionError } from '../utils/errorHandler.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import {
    getShiftStartRoleId,
    getShiftBreakRoleId,
    getShiftStopRoleId,
    getActiveShift,
    startShift,
    stopShift,
    toggleBreak,
    formatDuration,
} from '../services/shiftService.js';
import { buildShiftEmbed, buildShiftButtons } from '../commands/Staff/shift.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Verify the user has the role configured for the given shift action.
 * @param {import('discord.js').Interaction} interaction
 * @param {'start'|'break'|'stop'} action
 * @returns {Promise<string|null>} The role ID on success, or null after replying with an error.
 */
async function checkShiftRole(interaction, action) {
    const guildId = interaction.guildId;

    const getRoleId = {
        start: getShiftStartRoleId,
        break: getShiftBreakRoleId,
        stop: getShiftStopRoleId,
    }[action];

    const actionLabel = {
        start: 'start shifts',
        break: 'use break/resume',
        stop: 'stop shifts',
    }[action];

    const configSubcommand = {
        start: '`/shiftconfig setstartrole`',
        break: '`/shiftconfig setbreakrole`',
        stop: '`/shiftconfig setstoprole`',
    }[action];

    const roleId = await getRoleId(guildId);

    if (!roleId) {
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                errorEmbed(
                    `The shift system has not been fully configured yet. An administrator must run ${configSubcommand} first.`
                ),
            ],
        });
        return null;
    }

    const hasRole = interaction.member.roles.cache.has(roleId);
    if (!hasRole) {
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                errorEmbed(`You do not have the required role to ${actionLabel}.`),
            ],
        });
        return null;
    }

    return roleId;
}

/**
 * After any shift action, update the original management panel embed + buttons
 * to reflect the new state, then send a confirmation follow-up.
 */
async function refreshPanelAndConfirm(interaction, confirmEmbed) {
    const shift = await getActiveShift(interaction.user.id, interaction.guildId);
    const updatedEmbed = buildShiftEmbed(interaction.user, shift);
    const updatedRow = buildShiftButtons(shift);

    // Update the original deferred reply (the management panel)
    await InteractionHelper.safeEditReply(interaction, {
        embeds: [updatedEmbed],
        components: [updatedRow],
    });

    // Send the confirmation as an ephemeral follow-up
    await interaction.followUp({
        embeds: [confirmEmbed],
        flags: MessageFlags.Ephemeral,
    });
}

// ---------------------------------------------------------------------------
// shift_start
// ---------------------------------------------------------------------------

export const shiftStartHandler = {
    name: 'shift_start',
    async execute(interaction, client) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferSuccess) return;

            const roleId = await checkShiftRole(interaction, 'start');
            if (!roleId) return;

            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            const existing = await getActiveShift(userId, guildId);
            if (existing) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed('You already have an active shift. Use the **Stop Shift** button to end it first.'),
                    ],
                });
            }

            const shift = await startShift(userId, guildId);
            const startTimestamp = Math.floor(new Date(shift.start_time).getTime() / 1000);

            const confirmEmbed = createEmbed({
                title: '🟢 Shift Started',
                description: `Your shift has begun. Good luck, ${interaction.user}!`,
                color: 'success',
                fields: [
                    { name: 'Started At', value: `<t:${startTimestamp}:T> (<t:${startTimestamp}:R>)`, inline: true },
                ],
                timestamp: true,
            });

            await refreshPanelAndConfirm(interaction, confirmEmbed);
        } catch (error) {
            logger.error('shift_start button error:', error);
            await handleInteractionError(interaction, error, { subtype: 'shift_start_failed' });
        }
    },
};

// ---------------------------------------------------------------------------
// shift_break
// ---------------------------------------------------------------------------

export const shiftBreakHandler = {
    name: 'shift_break',
    async execute(interaction, client) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferSuccess) return;

            const roleId = await checkShiftRole(interaction, 'break');
            if (!roleId) return;

            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            const shift = await getActiveShift(userId, guildId);
            if (!shift) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed('You do not have an active shift. Use the **Start Shift** button to begin one.'),
                    ],
                });
            }

            const { shift: updated, nowOnBreak } = await toggleBreak(shift.id);
            const breakMs = Number(updated.break_time);

            const confirmEmbed = nowOnBreak
                ? createEmbed({
                      title: '⏸️ Break Started',
                      description: 'You are now on break. Time tracking is paused.',
                      color: 'warning',
                      fields: [
                          { name: 'Break Time So Far', value: formatDuration(breakMs), inline: true },
                      ],
                      timestamp: true,
                  })
                : createEmbed({
                      title: '▶️ Break Ended',
                      description: 'Welcome back! Time tracking has resumed.',
                      color: 'success',
                      fields: [
                          { name: 'Total Break Time', value: formatDuration(breakMs), inline: true },
                      ],
                      timestamp: true,
                  });

            await refreshPanelAndConfirm(interaction, confirmEmbed);
        } catch (error) {
            logger.error('shift_break button error:', error);
            await handleInteractionError(interaction, error, { subtype: 'shift_break_failed' });
        }
    },
};

// ---------------------------------------------------------------------------
// shift_stop
// ---------------------------------------------------------------------------

export const shiftStopHandler = {
    name: 'shift_stop',
    async execute(interaction, client) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferSuccess) return;

            const roleId = await checkShiftRole(interaction, 'stop');
            if (!roleId) return;

            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            const shift = await getActiveShift(userId, guildId);
            if (!shift) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed('You do not have an active shift. Use the **Start Shift** button to begin one.'),
                    ],
                });
            }

            const ended = await stopShift(shift.id);
            const startTimestamp = Math.floor(new Date(ended.start_time).getTime() / 1000);
            const endTimestamp = Math.floor(new Date(ended.end_time).getTime() / 1000);
            const totalMs = Number(ended.total_duration);
            const breakMs = Number(ended.break_time);

            const confirmEmbed = createEmbed({
                title: '🔴 Shift Ended',
                description: `Your shift has been recorded. Great work, ${interaction.user}!`,
                color: 'error',
                fields: [
                    { name: 'Started At', value: `<t:${startTimestamp}:T>`, inline: true },
                    { name: 'Ended At', value: `<t:${endTimestamp}:T>`, inline: true },
                    { name: '\u200B', value: '\u200B', inline: true },
                    { name: 'Total Duration', value: formatDuration(totalMs + breakMs), inline: true },
                    { name: 'Break Time', value: formatDuration(breakMs), inline: true },
                    { name: 'Active Time', value: formatDuration(Math.max(0, totalMs)), inline: true },
                ],
                timestamp: true,
            });

            await refreshPanelAndConfirm(interaction, confirmEmbed);
        } catch (error) {
            logger.error('shift_stop button error:', error);
            await handleInteractionError(interaction, error, { subtype: 'shift_stop_failed' });
        }
    },
};
