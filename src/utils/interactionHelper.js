// interactionHelper.js

import { logger } from './logger.js';
import { MessageFlags } from 'discord.js';
import { handleInteractionError, createError, ErrorTypes } from './errorHandler.js';
import { ResponseCoordinator } from './responseCoordinator.js';

const INTERACTION_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_DEFER_OPTIONS = { flags: MessageFlags.Ephemeral };
const INTERACTION_UNAVAILABLE_CODES = new Set([10062, 40060, 50027]);

function isInteractionUnavailableError(error) {
    return INTERACTION_UNAVAILABLE_CODES.has(error?.code);
}

function sanitizeEditReplyOptions(options = {}) {
    if (!options || typeof options !== 'object') {
        return options;
    }

    const { flags, ephemeral, ...rest } = options;

    if (flags && (flags & MessageFlags.IsComponentsV2)) {
        rest.flags = MessageFlags.IsComponentsV2;
    }
    return rest;
}

export class InteractionHelper {
    static getCoordinator(interaction) {
        return interaction?._responseCoordinator || null;
    }

    static patchInteractionResponses(interaction) {
        if (!interaction || interaction.__titanResponsePatched) {
            return;
        }

        const originalReply = interaction.reply?.bind(interaction);
        const originalEditReply = interaction.editReply?.bind(interaction);
        const originalFollowUp = interaction.followUp?.bind(interaction);

        if (!originalReply || !originalEditReply || !originalFollowUp) {
            return;
        }

        interaction.reply = async (options) => {
            const coordinator = InteractionHelper.getCoordinator(interaction);
            if (coordinator?.isUsageFinalized()) {
                return coordinator.getReplyMessage();
            }

            if (!interaction.deferred && !interaction.replied) {
                if (coordinator && interaction._isPrefixCommand) {
                    return coordinator.respond(options);
                }
                return await originalReply(options);
            }

            if (interaction.deferred && !interaction.replied) {
                if (coordinator && interaction._isPrefixCommand) {
                    return coordinator.edit(sanitizeEditReplyOptions(options));
                }
                return await originalEditReply(sanitizeEditReplyOptions(options));
            }

            if (coordinator && interaction._isPrefixCommand) {
                return coordinator.followUp(options);
            }
            return await originalFollowUp(options);
        };

        interaction.__titanResponsePatched = true;
    }

    static isInteractionValid(interaction) {
        if (!interaction || typeof interaction !== 'object') return false;
        if (!interaction.id || typeof interaction.id !== 'string') return false;

        if (!interaction.user || typeof interaction.user !== 'object') return false;

        if (interaction.createdTimestamp && (Date.now() - interaction.createdTimestamp) > INTERACTION_TIMEOUT_MS) {
            return false;
        }

        return true;
    }

    static async ensureReady(interaction, deferOptions = { flags: MessageFlags.Ephemeral }) {
        if (!this.isInteractionValid(interaction)) {
            return false;
        }

        if (interaction.replied || interaction.deferred) {
            return true;
        }

        if (interaction._isPrefixCommand) {
            const coordinator = this.getCoordinator(interaction) || ResponseCoordinator.attach(interaction);
            return coordinator.deferLocal();
        }

        return await this.safeDefer(interaction, deferOptions);
    }

    static async safeDefer(interaction, options = {}) {
        try {
            if (interaction.deferred || interaction.replied) {
                return true;
            }

            const coordinator = this.getCoordinator(interaction);
            if (coordinator?.isUsageFinalized()) {
                return false;
            }

            if (interaction._isPrefixCommand) {
                return coordinator?.deferLocal() ?? false;
            }

            if (!this.isInteractionValid(interaction)) {
                logger.warn(`Interaction ${interaction.id} has expired before defer, ignoring`);
                return false;
            }

            await interaction.deferReply(options);
            return true;
        } catch (error) {
            if (isInteractionUnavailableError(error)) {
                logger.warn(`Interaction ${interaction.id} unavailable during defer:`, error.message);
                return false;
            }
            if (error.name === 'InteractionAlreadyReplied' || error.code === 40060) {
                logger.warn(`Interaction ${interaction.id} already acknowledged during defer:`, error.message);
                return true;
            }
            logger.error('Failed to defer reply:', error);
            return false;
        }
    }

    static async safeEditReply(interaction, options) {
        try {
            const coordinator = this.getCoordinator(interaction);
            if (coordinator?.isUsageFinalized()) {
                return false;
            }

            if (!this.isInteractionValid(interaction)) {
                logger.warn(`Interaction ${interaction.id} has expired before edit, ignoring`);
                return false;
            }

            if (coordinator && (interaction._isPrefixCommand || coordinator.getReplyMessage())) {
                await coordinator.edit(sanitizeEditReplyOptions(options));
                return true;
            }

            if (!interaction.replied && !interaction.deferred) {
                logger.debug(`Interaction ${interaction.id} not deferred, using reply fallback instead of edit`);
                return await this.safeReply(interaction, options);
            }

            await interaction.editReply(sanitizeEditReplyOptions(options));
            return true;
        } catch (error) {
            if (isInteractionUnavailableError(error)) {
                logger.warn(`Interaction ${interaction.id} unavailable during edit:`, error.message);
                return false;
            }
            if (error.code === 40060) {
                logger.warn(`Interaction ${interaction.id} already acknowledged during edit:`, error.message);
                return false;
            }
            if (error.name === 'InteractionNotReplied' || error.message.includes('not been sent or deferred')) {
                logger.debug(`Interaction ${interaction.id} not replied, using reply fallback instead of edit:`, error.message);
                return await this.safeReply(interaction, options);
            }
            if (error.code === 10008) {
                logger.debug(`Interaction ${interaction.id} reply message deleted, using followUp fallback`);
                try {
                    await interaction.followUp(options);
                    return true;
                } catch (followUpError) {
                    if (isInteractionUnavailableError(followUpError)) {
                        logger.warn(`Interaction ${interaction.id} unavailable during followUp:`, followUpError.message);
                        return false;
                    }
                    logger.error('Failed to follow up after deleted reply:', followUpError);
                    return false;
                }
            }
            logger.error('Failed to edit reply:', error);
            return false;
        }
    }

    static async safeReply(interaction, options) {
        try {
            const coordinator = this.getCoordinator(interaction);
            if (coordinator?.isUsageFinalized()) {
                return false;
            }

            if (!this.isInteractionValid(interaction)) {
                logger.warn(`Interaction ${interaction.id} has expired before reply, ignoring`);
                return false;
            }

            if (coordinator && (interaction._isPrefixCommand || coordinator.hasResponded())) {
                if (coordinator.hasResponded()) {
                    await coordinator.edit(sanitizeEditReplyOptions(options));
                } else {
                    await coordinator.respond(options);
                }
                return true;
            }

            if (interaction.deferred && !interaction.replied) {
                await interaction.editReply(sanitizeEditReplyOptions(options));
                return true;
            }

            if (interaction.replied) {
                await interaction.followUp(options);
                return true;
            }

            await interaction.reply(options);
            return true;
        } catch (error) {
            if (isInteractionUnavailableError(error)) {
                logger.warn(`Interaction ${interaction.id} unavailable during reply:`, error.message);
                return false;
            }
            if (error.code === 40060) {
                logger.warn(`Interaction ${interaction.id} already acknowledged during reply:`, error.message);
                return false;
            }
            logger.error('Failed to reply:', error);
            return false;
        }
    }

    static async safeShowModal(interaction, modal) {
        try {
            if (!this.isInteractionValid(interaction)) {
                logger.warn(`Interaction ${interaction.id} has expired before showModal, ignoring`);
                return false;
            }

            if (interaction.replied || interaction.deferred) {
                logger.warn(`Interaction ${interaction.id} already acknowledged, cannot show modal`);
                return false;
            }

            await interaction.showModal(modal);
            return true;
        } catch (error) {
            if (isInteractionUnavailableError(error)) {
                logger.warn(`Interaction ${interaction.id} unavailable during showModal:`, error.message);
                return false;
            }
            logger.error('Failed to show modal:', error);
            return false;
        }
    }

    static async safeExecute(interaction, commandFunction, errorEmbed, options = {}) {
        const autoDeferDefault = !interaction._isPrefixCommand;
        const { autoDefer = autoDeferDefault, deferOptions = { flags: MessageFlags.Ephemeral } } = options;

        if (!this.isInteractionValid(interaction)) {
            logger.warn(`Interaction ${interaction.id} has expired, ignoring`);
            return;
        }

        const coordinator = this.getCoordinator(interaction);
        if (coordinator?.isUsageFinalized()) {
            return;
        }

        if (autoDefer && !interaction.replied && !interaction.deferred) {
            const deferStartTime = Date.now();
            const deferSuccess = await this.safeDefer(interaction, deferOptions);

            if (Date.now() - deferStartTime > 3000) {
                logger.warn(`Interaction ${interaction.id} defer took too long (${Date.now() - deferStartTime}ms), command may expire`);
            }

            if (!deferSuccess) {
                logger.warn(`Interaction ${interaction.id} defer failed, skipping command execution`);
                return;
            }
        }

        try {
            await commandFunction();
        } catch (error) {
            logger.error('Error executing command:', error);

            if (coordinator?.isUsageFinalized()) {
                return;
            }

            const errorToHandle = typeof errorEmbed === 'string'
                ? createError(error.message || 'Command failed', ErrorTypes.UNKNOWN, errorEmbed, { expected: true })
                : error;

            await handleInteractionError(interaction, errorToHandle, { source: 'interactionHelper.safeExecute' });
        }
    }

    static async universalReply(interaction, options) {
        const coordinator = this.getCoordinator(interaction);
        if (coordinator?.isUsageFinalized()) {
            return false;
        }

        if (interaction._isPrefixCommand) {
            if (coordinator?.hasResponded()) {
                return await coordinator.edit(sanitizeEditReplyOptions(options));
            }
            return await coordinator?.respond(options) ?? this.safeReply(interaction, options);
        }

        const isReady = await this.ensureReady(interaction, options.flags ? { flags: options.flags } : {});
        if (!isReady) {
            return false;
        }

        if (interaction.deferred) {
            return await this.safeEditReply(interaction, options);
        }

        return await this.safeReply(interaction, options);
    }
}

export function withSafeExecuteDecorator(target, propertyName, descriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function(interaction, config, client) {
        await InteractionHelper.safeExecute(
            interaction,
            () => originalMethod.call(this, interaction, config, client),
            null,
            { autoDefer: !interaction._isPrefixCommand },
        );
    };

    return descriptor;
}
