// errorHandler.js
//
// User-facing error rules:
// 1. Use replyUserError or handleInteractionError — not raw errorEmbed in commands/handlers
// 2. Set a specific userMessage when you know the cause
// 3. Use ErrorTypes — don't invent custom title strings
// 4. Put guidance in the description, not embed tip fields
// 5. Success/info/warning replies use successEmbed / infoEmbed / warningEmbed

import { logger } from './logger.js';
import { buildUserErrorEmbed } from './embeds.js';
import { MessageFlags } from 'discord.js';
import { getErrorMetadata, getDefaultErrorCodeByType, resolveErrorCode, ErrorCodes } from './errorRegistry.js';
import { InteractionHelper } from './interactionHelper.js';

export const ErrorTypes = {
    VALIDATION: 'validation',
    PERMISSION: 'permission',
    CONFIGURATION: 'configuration',
    DATABASE: 'database',
    NETWORK: 'network',
    DISCORD_API: 'discord_api',
    USER_INPUT: 'user_input',
    RATE_LIMIT: 'rate_limit',
    UNKNOWN: 'unknown'
};

export class TitanBotError extends Error {
    constructor(message, type = ErrorTypes.UNKNOWN, userMessage = null, context = {}) {
        super(message);
        this.name = 'TitanBotError';
        this.type = type;
        this.userMessage = userMessage;
        this.context = context;
        this.code = context?.errorCode || getDefaultErrorCodeByType(type);
        this.timestamp = new Date().toISOString();
    }
}

export function categorizeError(error) {
    if (error instanceof TitanBotError) {
        return error.type;
    }

    const message = error.message?.toLowerCase() || '';
    const code = error.code;

    if (code >= 10000 && code < 20000) {
        return ErrorTypes.DISCORD_API;
    }

    if (message.includes('rate limit') || code === 50001) {
        return ErrorTypes.RATE_LIMIT;
    }

    if (message.includes('permission') || message.includes('missing') || code === 50013) {
        return ErrorTypes.PERMISSION;
    }

    if (message.includes('database') || message.includes('connection') || message.includes('timeout')) {
        return ErrorTypes.DATABASE;
    }

    if (message.includes('network') || message.includes('fetch') || message.includes('enotconn')) {
        return ErrorTypes.NETWORK;
    }

    if (message.includes('config') || message.includes('not found') || message.includes('invalid')) {
        return ErrorTypes.CONFIGURATION;
    }

    if (message.includes('validation') || message.includes('invalid') || message.includes('required')) {
        return ErrorTypes.VALIDATION;
    }

    return ErrorTypes.UNKNOWN;
}

const UserMessages = {
    [ErrorTypes.VALIDATION]: {
        default: 'Please check your input and try again.',
        missing_required: "You're missing some required information. Check the command options and try again.",
        invalid_format: 'The format you provided is incorrect. Check the command usage and try again.'
    },
    [ErrorTypes.PERMISSION]: {
        default: "You don't have permission to do that.",
        user_permission: "You don't have permission to use this command.",
        bot_permission: "I don't have the permissions needed to do that in this channel."
    },
    [ErrorTypes.CONFIGURATION]: {
        default: 'This feature is not set up yet. Ask a server administrator to configure it.',
        missing_config: 'This feature has not been configured yet. Ask a server administrator to set it up.',
        invalid_config: 'The server configuration for this feature is invalid. Ask a server administrator to review it.'
    },
    [ErrorTypes.DATABASE]: {
        default: 'Something went wrong while saving data. Please try again in a moment.',
        connection_failed: 'I could not reach the database. Please try again later.',
        timeout: 'That took too long to complete. Please try again.'
    },
    [ErrorTypes.NETWORK]: {
        default: 'I could not reach an external service. Please try again in a moment.',
        timeout: 'The request timed out. Please try again.',
        unreachable: 'The service is unavailable right now. Please try again later.'
    },
    [ErrorTypes.DISCORD_API]: {
        default: 'Discord rejected that request. Please try again in a moment.',
        rate_limit: "You're doing that too quickly. Wait a moment and try again.",
        forbidden: "I'm not allowed to do that here. Check my role permissions."
    },
    [ErrorTypes.USER_INPUT]: {
        default: 'There was a problem with your request. Check your input and try again.',
        invalid_user: 'I could not find that user. Check the mention or ID and try again.',
        invalid_channel: 'I could not find that channel. Check the mention or ID and try again.'
    },
    [ErrorTypes.RATE_LIMIT]: {
        default: "You're doing that too quickly. Wait a moment and try again.",
        command_cooldown: 'This command is on cooldown. Wait before using it again.',
        global_rate_limit: 'Discord is rate limiting requests. Wait a moment and try again.'
    },
    [ErrorTypes.UNKNOWN]: {
        default: 'Something went wrong. Please try again in a moment.',
        unexpected: 'An unexpected error occurred. Please try again later.',
        warn_failed: 'I could not warn that member. Check my permissions and role hierarchy, then try again.',
        kick_failed: 'I could not kick that member. Check my permissions and role hierarchy, then try again.',
        ban_failed: 'I could not ban that member. Check my permissions and role hierarchy, then try again.',
        unban_failed: 'I could not unban that user. Check my permissions and try again.',
        timeout_failed: 'I could not timeout that member. Check my permissions and role hierarchy, then try again.',
        untimeout_failed: 'I could not remove the timeout. Check my permissions and try again.'
    }
};

export function getUserMessage(error, context = {}) {
    const type = categorizeError(error);
    const messages = UserMessages[type] || UserMessages[ErrorTypes.UNKNOWN];

    if (error.userMessage) {
        return error.userMessage;
    }

    if (context.subtype && messages[context.subtype]) {
        return messages[context.subtype];
    }

    if (context.subtype && UserMessages[ErrorTypes.UNKNOWN][context.subtype]) {
        return UserMessages[ErrorTypes.UNKNOWN][context.subtype];
    }

    return messages.default;
}

function buildErrorLogData(interaction, error, errorType, context = {}) {
    const resolvedErrorCode = resolveErrorCode({ error, errorType, context });
    const errorMetadata = getErrorMetadata(resolvedErrorCode);
    const traceId = context.traceId || interaction?.traceContext?.traceId || interaction?.traceId || error?.context?.traceId;

    return {
        logData: {
            event: 'interaction.error',
            errorCode: resolvedErrorCode,
            remediationHint: errorMetadata.remediation,
            severity: errorMetadata.severity,
            retryable: errorMetadata.retryable,
            error: error.message,
            type: errorType,
            traceId,
            guildId: interaction?.guildId,
            userId: interaction?.user?.id,
            command: interaction?.commandName || context.command,
            interaction: interaction ? {
                type: interaction.type,
                commandName: interaction.commandName,
                customId: interaction.customId,
                userId: interaction.user?.id,
                guildId: interaction.guildId,
                channelId: interaction.channelId
            } : undefined,
            context
        },
        traceId,
        resolvedErrorCode,
        errorMetadata
    };
}

function logInteractionError(error, errorType, logData) {
    const isUserError = [
        ErrorTypes.VALIDATION,
        ErrorTypes.RATE_LIMIT,
        ErrorTypes.USER_INPUT,
        ErrorTypes.PERMISSION
    ].includes(errorType);
    const isExpectedError = Boolean(error?.context?.expected === true || error?.context?.suppressErrorLog === true);

    if (isUserError || isExpectedError) {
        if (errorType !== ErrorTypes.RATE_LIMIT) {
            logger.debug(`User Error [${errorType.toUpperCase()}]: ${error.userMessage || error.message}`, logData);
        }
    } else {
        logger.error(`System Error [${errorType.toUpperCase()}]`, {
            ...logData,
            stack: error.stack
        });
    }
}

async function sendErrorResponse(interaction, embed, context = {}) {
    try {
        if (!interaction || !interaction.id) {
            logger.warn('Interaction was null or invalid when handling error', {
                event: 'interaction.error.invalid_interaction',
                errorCode: ErrorCodes.INTERACTION_INVALID,
                remediationHint: getErrorMetadata(ErrorCodes.INTERACTION_INVALID).remediation,
                traceId: context.traceId
            });
            return false;
        }

        const coordinator = InteractionHelper.getCoordinator(interaction);
        if (coordinator?.isUsageFinalized()) {
            return false;
        }

        if (interaction.createdTimestamp && (Date.now() - interaction.createdTimestamp) > 14 * 60 * 1000) {
            logger.warn('Interaction expired before error handler could send response', {
                event: 'interaction.error.expired',
                errorCode: ErrorCodes.INTERACTION_EXPIRED,
                remediationHint: getErrorMetadata(ErrorCodes.INTERACTION_EXPIRED).remediation,
                traceId: context.traceId,
                guildId: interaction.guildId,
                userId: interaction.user?.id,
                command: interaction.commandName || context.command
            });
            return false;
        }

        const errorMessage = { embeds: [embed] };

        if (interaction._isPrefixCommand) {
            if (coordinator?.hasResponded()) {
                await coordinator.edit(errorMessage);
            } else {
                await coordinator?.respond(errorMessage);
            }
            return true;
        }

        const useEphemeral = context.ephemeral !== false;
        if (useEphemeral && !interaction.deferred && !interaction.replied) {
            errorMessage.flags = MessageFlags.Ephemeral;
        }

        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }

        return true;
    } catch (replyError) {
        if (replyError.code === 40060 || replyError.code === 10062 || replyError.code === 50027) {
            logger.warn('Interaction already acknowledged, expired, or token invalid; cannot send error response:', {
                event: 'interaction.error.response_unavailable',
                errorCode: String(replyError.code),
                traceId: context.traceId,
                guildId: interaction.guildId,
                userId: interaction.user?.id,
                command: interaction.commandName || context.command,
                code: replyError.code
            });
            return false;
        }

        logger.error('Failed to send error response:', {
            event: 'interaction.error.response_failed',
            errorCode: String(replyError.code || ErrorCodes.INTERACTION_RESPONSE_FAILED),
            remediationHint: getErrorMetadata(ErrorCodes.INTERACTION_RESPONSE_FAILED).remediation,
            traceId: context.traceId,
            guildId: interaction.guildId,
            userId: interaction.user?.id,
            command: interaction.commandName || context.command,
            error: replyError
        });
        return false;
    }
}

/**
 * Reply with a typed user-facing error (early-return validation, permission checks, etc.).
 */
export async function replyUserError(interaction, {
    type = ErrorTypes.UNKNOWN,
    message,
    subtype = null,
    ephemeral = true,
    context = {}
} = {}) {
    const errorType = type || ErrorTypes.UNKNOWN;
    const syntheticError = message
        ? createError('User error', errorType, message, { expected: true, ...context })
        : createError('User error', errorType, null, { expected: true, ...context });

    const userMessage = getUserMessage(syntheticError, { subtype, ...context });
    const { logData, traceId } = buildErrorLogData(interaction, syntheticError, errorType, {
        ...context,
        subtype,
        source: context.source || 'replyUserError'
    });

    logInteractionError(syntheticError, errorType, logData);

    const embed = buildUserErrorEmbed(errorType, userMessage);
    return sendErrorResponse(interaction, embed, { ...context, traceId, ephemeral, subtype });
}

export async function handleInteractionError(interaction, error, context = {}) {
    const errorType = categorizeError(error);
    const userMessage = getUserMessage(error, context);
    const { logData, traceId } = buildErrorLogData(interaction, error, errorType, context);

    logInteractionError(error, errorType, logData);

    const embed = buildUserErrorEmbed(errorType, userMessage);
    await sendErrorResponse(interaction, embed, { ...context, traceId });
}

export function withErrorHandling(fn, context = {}) {
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (error) {
            const interaction = args.find((arg) =>
                arg && typeof arg === 'object' &&
                (arg.isCommand || arg.isButton || arg.isModalSubmit || arg.isStringSelectMenu || arg.isChatInputCommand || arg._isPrefixCommand)
            );

            if (interaction) {
                await handleInteractionError(interaction, error, context);
            } else {
                logger.error('Error in non-interaction context:', error);
            }

            return null;
        }
    };
}

export function createError(message, type = ErrorTypes.UNKNOWN, userMessage = null, context = {}) {
    const normalizedContext = {
        ...context,
        errorCode: context?.errorCode || getDefaultErrorCodeByType(type)
    };

    return new TitanBotError(message, type, userMessage, normalizedContext);
}

export default {
    ErrorTypes,
    TitanBotError,
    categorizeError,
    getUserMessage,
    replyUserError,
    handleInteractionError,
    withErrorHandling,
    createError
};
