// errorHandler.js — the single entry point for all error handling.
//
// Rules:
// 1. Commands/handlers: throw NexoBotError (via createError) or let errors propagate;
//    interactionCreate routes them through handleInteractionError. For expected user-facing
//    failures (validation, cooldowns), use replyUserError.
//    Do NOT wrap a command's execute() body in a try/catch whose only purpose is to call
//    handleInteractionError — that is redundant because interactionCreate already catches
//    command.execute errors and calls handleInteractionError with COMMAND_ERROR_SUBTYPES.
//    Only keep a local try/catch when the catch does something more (custom recovery,
//    typed re-throw, status-code branching) or when it lives in a standalone handler
//    (collector callbacks, modal/component handlers) not reached via the command path.
// 2. Services: throw, never return { success: false }. Wrap exports with wrapServiceBoundary
//    (re-exported here) so unknown errors get typed with service/operation context.
// 3. Background tasks (cron, timers): wrap with handleTaskError / runSafeTask.
// 4. Set a specific userMessage when you know the cause; use ErrorTypes, don't invent titles.
// 5. Success/info/warning replies use successEmbed / infoEmbed / warningEmbed.

import { logger } from './logger.js';
import { buildUserErrorEmbed } from './embeds.js';
import { MessageFlags } from 'discord.js';
import type { EmbedBuilder, InteractionReplyOptions } from 'discord.js';
import { getErrorMetadata, getDefaultErrorCodeByType, resolveErrorCode, ErrorCodes } from './errorRegistry.js';
import { InteractionHelper } from './interactionHelper.js';
import type { NexoInteraction } from './interactionHelper.js';

// Re-export so consumers only ever need to import from errorHandler.js
export { ErrorCodes, getErrorMetadata, resolveErrorCode, getDefaultErrorCodeByType } from './errorRegistry.js';
export { ensureTypedServiceError, wrapServiceBoundary, wrapServiceClassMethods } from './serviceErrorBoundary.js';

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
} as const;

export type ErrorType = typeof ErrorTypes[keyof typeof ErrorTypes];

/** Structured context attached to errors and log lines. Unknown keys are passed through to the log. */
export interface ErrorContext {
    errorCode?: string;
    expected?: boolean;
    suppressErrorLog?: boolean;
    source?: string;
    traceId?: string | null;
    subtype?: string | null;
    command?: string | null;
    ephemeral?: boolean;
    [key: string]: unknown;
}

/** Loose view of a caught value; used to mirror the property reads done on thrown errors. */
export type ErrorLike = Error & {
    code?: string | number;
    userMessage?: string | null;
    context?: ErrorContext;
};

/** Interaction view for logging: commandName/customId exist only on some interaction kinds. */
type LoggableInteraction = NexoInteraction & { commandName?: string; customId?: string };

export class NexoBotError extends Error {
    type: ErrorType;
    userMessage: string | null;
    context: ErrorContext;
    code: string;
    timestamp: string;

    constructor(message: string, type: ErrorType = ErrorTypes.UNKNOWN, userMessage: string | null = null, context: ErrorContext = {}) {
        super(message);
        this.name = 'NexoBotError';
        this.type = type;
        this.userMessage = userMessage;
        this.context = context;
        this.code = context?.errorCode || getDefaultErrorCodeByType(type);
        this.timestamp = new Date().toISOString();
    }
}

// Discord API error codes that indicate a permission problem rather than a bug.
const DISCORD_PERMISSION_CODES: ReadonlySet<unknown> = new Set([
    50001, // Missing Access
    50013, // Missing Permissions
    50007, // Cannot send messages to this user (DMs closed)
    160002, // Cannot reply without permission to read message history
]);

// PostgreSQL / node-postgres error codes and errno values that indicate database trouble.
const DATABASE_ERROR_CODES: ReadonlySet<string> = new Set([
    'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT',
    '57014', // query_canceled (statement timeout)
    '53300', // too_many_connections
    '08006', '08001', '08003', // connection failures
    '40001', '40P01', // serialization failure / deadlock
]);

const TECHNICAL_ERROR_PATTERNS = [
    /^typeerror:/i,
    /^referenceerror:/i,
    /^syntaxerror:/i,
    /cannot read propert/i,
    /is not a function/i,
    /is not defined/i,
    /unexpected token/i,
    /econnrefused|enotfound|etimedout|econnreset/i,
    /node_modules/i,
    /\sat\s.+\(.+\:\d+\:\d+\)/,
];

const USER_FACING_ERROR_HINTS = [
    /^please\b/i,
    /^you must\b/i,
    /^provide\b/i,
    /^select\b/i,
    /^choose\b/i,
    /^enter\b/i,
    /^that\b/i,
    /^this\b/i,
    /^unsupported\b/i,
    /^unknown command\b/i,
    /^invalid\b/i,
    /^missing\b/i,
    /^cannot\b/i,
    /^could not find\b/i,
    // German user messages
    /^bitte\b/i,
    /^du\b/i,
    /^dein/i,
    /^gib\b/i,
    /^wähle\b/i,
    /^ungültig/i,
    /^unbekannte[rs]?\b/i,
    /^fehlende?\b/i,
    /^kein/i,
    /^diese[rs]?\b/i,
    /^das\b/i,
    /^nicht unterstützt/i,
];

function isUserFacingPlainError(error: unknown): error is Error {
    if (error instanceof NexoBotError) {
        return false;
    }

    const err = error as ErrorLike | null | undefined;
    const message = typeof err?.message === 'string' ? err.message.trim() : '';
    if (!message || message.length > 500 || message.includes('\n')) {
        return false;
    }

    if (TECHNICAL_ERROR_PATTERNS.some((pattern) => pattern.test(message))) {
        return false;
    }

    const lowerMessage = message.toLowerCase();
    if (USER_FACING_ERROR_HINTS.some((pattern) => pattern.test(message))) {
        return true;
    }

    if (lowerMessage.includes('not found')
        || lowerMessage.includes('not configured')
        || lowerMessage.includes('not set up')
        || lowerMessage.includes('not available')
        || lowerMessage.includes('permission')
        || lowerMessage.includes('must be ')
        || lowerMessage.includes('at least ')
        || lowerMessage.includes('no longer than ')
        || lowerMessage.includes('at most ')
        || lowerMessage.includes('nicht gefunden')
        || lowerMessage.includes('nicht konfiguriert')
        || lowerMessage.includes('nicht eingerichtet')
        || lowerMessage.includes('nicht verfügbar')
        || lowerMessage.includes('berechtigung')
        || lowerMessage.includes('muss ')
        || lowerMessage.includes('mindestens ')
        || lowerMessage.includes('höchstens ')) {
        return true;
    }

    return false;
}

function inferErrorTypeFromUserMessage(message: string = ''): ErrorType {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('permission') || lowerMessage.includes('not allowed')
        || lowerMessage.includes('berechtigung') || lowerMessage.includes('nicht erlaubt')) {
        return ErrorTypes.PERMISSION;
    }

    if (lowerMessage.includes('rate limit') || lowerMessage.includes('cooldown') || lowerMessage.includes('too quickly')
        || lowerMessage.includes('zu schnell')) {
        return ErrorTypes.RATE_LIMIT;
    }

    if (lowerMessage.includes('database') || lowerMessage.includes('postgres') || lowerMessage.includes('sql')
        || lowerMessage.includes('datenbank')) {
        return ErrorTypes.DATABASE;
    }

    if (lowerMessage.includes('not found')
        || lowerMessage.includes('not configured')
        || lowerMessage.includes('not set up')
        || lowerMessage.includes('disabled')
        || lowerMessage.includes('unknown command')
        || lowerMessage.includes('unknown category')
        || lowerMessage.includes('nicht gefunden')
        || lowerMessage.includes('nicht konfiguriert')
        || lowerMessage.includes('nicht eingerichtet')
        || lowerMessage.includes('deaktiviert')
        || lowerMessage.includes('unbekannter command')
        || lowerMessage.includes('unbekannte kategorie')) {
        return ErrorTypes.CONFIGURATION;
    }

    if (lowerMessage.includes('channel') || lowerMessage.includes('user') || lowerMessage.includes('role') || lowerMessage.includes('mention')
        || lowerMessage.includes('kanal') || lowerMessage.includes('nutzer') || lowerMessage.includes('rolle') || lowerMessage.includes('mitglied')) {
        return ErrorTypes.USER_INPUT;
    }

    return ErrorTypes.VALIDATION;
}

function normalizeInteractionError(error: unknown, context: ErrorContext = {}): unknown {
    if (error instanceof NexoBotError) {
        return error;
    }

    if (!isUserFacingPlainError(error)) {
        return error;
    }

    const message = error.message.trim();
    const type = inferErrorTypeFromUserMessage(message);

    return createError(message, type, message, {
        ...context,
        expected: true,
        source: context.source || 'normalizeInteractionError',
    });
}

export function categorizeError(error: unknown): ErrorType {
    if (error instanceof NexoBotError) {
        return error.type;
    }

    const err = error as ErrorLike | null | undefined;
    const message = err?.message?.toLowerCase() || '';
    const code = err?.code;

    if (typeof code === 'string' && DATABASE_ERROR_CODES.has(code)) {
        return ErrorTypes.DATABASE;
    }

    if (message.includes('rate limit') || code === 429) {
        return ErrorTypes.RATE_LIMIT;
    }

    if (DISCORD_PERMISSION_CODES.has(code)) {
        return ErrorTypes.PERMISSION;
    }

    // Remaining numeric codes in Discord's ranges (unknown entity 10xxx, request-level 5xxxx, etc.)
    if (typeof code === 'number' && code >= 10000) {
        return ErrorTypes.DISCORD_API;
    }

    if (err?.name === 'AbortError' || message.includes('network') || message.includes('fetch failed') || message.includes('enotconn')) {
        return ErrorTypes.NETWORK;
    }

    if (message.includes('permission') || message.includes('missing access') || message.includes('missing permissions')) {
        return ErrorTypes.PERMISSION;
    }

    if (message.includes('database') || message.includes('postgres') || message.includes('sql') || message.includes('connection') || message.includes('timeout')) {
        return ErrorTypes.DATABASE;
    }

    if (message.includes('validation') || message.includes('invalid') || message.includes('required')) {
        return ErrorTypes.VALIDATION;
    }

    if (message.includes('config') || message.includes('not found')) {
        return ErrorTypes.CONFIGURATION;
    }

    if (isUserFacingPlainError(error)) {
        return inferErrorTypeFromUserMessage(error.message);
    }

    if (err?.name === 'DiscordAPIError' || err?.name === 'HTTPError') {
        return ErrorTypes.DISCORD_API;
    }

    return ErrorTypes.UNKNOWN;
}

const UserMessages: Record<string, Record<string, string>> = {
    [ErrorTypes.VALIDATION]: {
        default: 'Bitte prüfe deine Eingabe und versuch es erneut.',
        missing_required: 'Dir fehlen erforderliche Angaben. Prüfe die Command-Optionen und versuch es erneut.',
        invalid_format: 'Das Format deiner Eingabe ist falsch. Prüfe die Verwendung des Commands und versuch es erneut.'
    },
    [ErrorTypes.PERMISSION]: {
        default: 'Du hast keine Berechtigung dafür.',
        user_permission: 'Du hast keine Berechtigung, diesen Command zu nutzen.',
        bot_permission: 'Mir fehlen die nötigen Berechtigungen in diesem Kanal.'
    },
    [ErrorTypes.CONFIGURATION]: {
        default: 'Diese Funktion ist noch nicht eingerichtet. Bitte einen Server-Admin, sie zu konfigurieren.',
        missing_config: 'Diese Funktion wurde noch nicht konfiguriert. Bitte einen Server-Admin, sie einzurichten.',
        invalid_config: 'Die Server-Konfiguration für diese Funktion ist ungültig. Bitte einen Server-Admin, sie zu prüfen.'
    },
    [ErrorTypes.DATABASE]: {
        default: 'Beim Speichern ist etwas schiefgelaufen. Bitte versuch es gleich noch einmal.',
        connection_failed: 'Ich konnte die Datenbank nicht erreichen. Bitte versuch es später erneut.',
        timeout: 'Das hat zu lange gedauert. Bitte versuch es erneut.'
    },
    [ErrorTypes.NETWORK]: {
        default: 'Ich konnte einen externen Dienst nicht erreichen. Bitte versuch es gleich noch einmal.',
        timeout: 'Die Anfrage hat zu lange gedauert. Bitte versuch es erneut.',
        unreachable: 'Der Dienst ist gerade nicht erreichbar. Bitte versuch es später erneut.'
    },
    [ErrorTypes.DISCORD_API]: {
        default: 'Discord hat die Anfrage abgelehnt. Bitte versuch es gleich noch einmal.',
        rate_limit: 'Du bist zu schnell. Warte kurz und versuch es erneut.',
        forbidden: 'Das darf ich hier nicht. Prüfe die Berechtigungen meiner Rolle.',
        interaction_expired: 'Diese Interaktion ist abgelaufen. Bitte führe den Command erneut aus.',
        already_acknowledged: 'Diese Aktion wurde bereits verarbeitet. Führe den Command erneut aus, falls du noch Hilfe brauchst.',
        invalid_form_body: 'Discord hat die Anfrage abgelehnt. Versuch es mit einer anderen Eingabe.'
    },
    [ErrorTypes.USER_INPUT]: {
        default: 'Bei deiner Anfrage gab es ein Problem. Prüfe deine Eingabe und versuch es erneut.',
        invalid_user: 'Ich konnte diesen Nutzer nicht finden. Prüfe die Erwähnung oder ID und versuch es erneut.',
        invalid_channel: 'Ich konnte diesen Kanal nicht finden. Prüfe die Erwähnung oder ID und versuch es erneut.'
    },
    [ErrorTypes.RATE_LIMIT]: {
        default: 'Du bist zu schnell. Warte kurz und versuch es erneut.',
        command_cooldown: 'Dieser Command hat gerade Cooldown. Warte kurz, bevor du ihn erneut nutzt.',
        global_rate_limit: 'Discord bremst gerade Anfragen aus. Warte kurz und versuch es erneut.'
    },
    [ErrorTypes.UNKNOWN]: {
        default: 'Etwas ist schiefgelaufen. Bitte versuch es gleich noch einmal.',
        unexpected: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuch es später erneut.',
        warn_failed: 'Ich konnte dieses Mitglied nicht verwarnen. Prüfe meine Berechtigungen und die Rollenhierarchie.',
        kick_failed: 'Ich konnte dieses Mitglied nicht kicken. Prüfe meine Berechtigungen und die Rollenhierarchie.',
        ban_failed: 'Ich konnte dieses Mitglied nicht bannen. Prüfe meine Berechtigungen und die Rollenhierarchie.',
        unban_failed: 'Ich konnte diesen Nutzer nicht entbannen. Prüfe meine Berechtigungen und versuch es erneut.',
        timeout_failed: 'Ich konnte diesem Mitglied keinen Timeout geben. Prüfe meine Berechtigungen und die Rollenhierarchie.',
        untimeout_failed: 'Ich konnte den Timeout nicht aufheben. Prüfe meine Berechtigungen und versuch es erneut.'
    }
};

export function getUserMessage(error: unknown, context: ErrorContext = {}): string {
    const type = categorizeError(error);
    const messages = UserMessages[type] || UserMessages[ErrorTypes.UNKNOWN];
    const err = error as ErrorLike;

    if (err.userMessage) {
        return err.userMessage;
    }

    if (isUserFacingPlainError(error)) {
        return error.message.trim();
    }

    if (type === ErrorTypes.DISCORD_API) {
        if (err?.code === 10062) {
            return messages.interaction_expired;
        }
        if (err?.code === 40060 || err?.code === 50027) {
            return messages.already_acknowledged;
        }
        if (err?.code === 50035) {
            return messages.invalid_form_body;
        }
    }

    if (context.subtype && messages[context.subtype]) {
        return messages[context.subtype];
    }

    if (context.subtype && UserMessages[ErrorTypes.UNKNOWN][context.subtype]) {
        return UserMessages[ErrorTypes.UNKNOWN][context.subtype];
    }

    return messages.default;
}

function buildErrorLogData(interaction: LoggableInteraction | null | undefined, error: unknown, errorType: string, context: ErrorContext = {}) {
    const err = error as ErrorLike;
    const resolvedErrorCode = resolveErrorCode({ error, errorType, context });
    const errorMetadata = getErrorMetadata(resolvedErrorCode);
    const traceId = context.traceId || interaction?.traceContext?.traceId || interaction?.traceId || err?.context?.traceId;

    return {
        logData: {
            event: 'interaction.error',
            errorCode: resolvedErrorCode,
            remediationHint: errorMetadata.remediation,
            severity: errorMetadata.severity,
            retryable: errorMetadata.retryable,
            error: err.message,
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

function logInteractionError(error: unknown, errorType: string, logData: object): void {
    const err = error as ErrorLike;
    const isUserError = USER_ERROR_TYPES.has(errorType);
    const isExpectedError = Boolean(err?.context?.expected === true || err?.context?.suppressErrorLog === true);

    if (isUserError || isExpectedError) {
        if (errorType !== ErrorTypes.RATE_LIMIT) {
            logger.debug(`User Error [${errorType.toUpperCase()}]: ${err.userMessage || err.message}`, logData);
        }
    } else {
        logger.error(`System Error [${errorType.toUpperCase()}]`, {
            ...logData,
            stack: err.stack
        });
    }
}

async function sendErrorResponse(interaction: LoggableInteraction | null | undefined, embed: EmbedBuilder, context: ErrorContext = {}): Promise<boolean> {
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

        if (interaction.replied) {
            // A visible reply already exists; don't overwrite it — follow up ephemerally.
            await interaction.followUp({ ...errorMessage, flags: MessageFlags.Ephemeral });
        } else if (interaction.deferred) {
            await interaction.editReply(errorMessage);
        } else {
            const replyMessage: InteractionReplyOptions = errorMessage;
            if (useEphemeral) {
                replyMessage.flags = MessageFlags.Ephemeral;
            }
            await interaction.reply(replyMessage);
        }

        return true;
    } catch (caught) {
        const replyError = caught as ErrorLike;
        if (replyError.code === 40060 || replyError.code === 10062 || replyError.code === 50027) {
            logger.warn('Interaction already acknowledged, expired, or token invalid; cannot send error response:', {
                event: 'interaction.error.response_unavailable',
                errorCode: String(replyError.code),
                traceId: context.traceId,
                guildId: interaction!.guildId,
                userId: interaction!.user?.id,
                command: interaction!.commandName || context.command,
                code: replyError.code
            });
            return false;
        }

        logger.error('Failed to send error response:', {
            event: 'interaction.error.response_failed',
            errorCode: String(replyError.code || ErrorCodes.INTERACTION_RESPONSE_FAILED),
            remediationHint: getErrorMetadata(ErrorCodes.INTERACTION_RESPONSE_FAILED).remediation,
            traceId: context.traceId,
            guildId: interaction!.guildId,
            userId: interaction!.user?.id,
            command: interaction!.commandName || context.command,
            error: replyError
        });
        return false;
    }
}

/**
 * Reply with a typed user-facing error (early-return validation, permission checks, etc.).
 */
export interface UserErrorOptions {
    type?: ErrorType;
    message?: string | null;
    subtype?: string | null;
    ephemeral?: boolean;
    context?: ErrorContext;
}

export async function replyUserError(interaction: NexoInteraction | null | undefined, {
    type = ErrorTypes.UNKNOWN,
    message,
    subtype = null,
    ephemeral = true,
    context = {}
}: UserErrorOptions = {}): Promise<boolean> {
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

const USER_ERROR_TYPES: ReadonlySet<string> = new Set([
    ErrorTypes.VALIDATION,
    ErrorTypes.RATE_LIMIT,
    ErrorTypes.USER_INPUT,
    ErrorTypes.PERMISSION,
    ErrorTypes.CONFIGURATION,
]);

function buildErrorReference(resolvedErrorCode: string, traceId: unknown): string {
    const shortTrace = traceId ? String(traceId).slice(0, 8) : null;
    return shortTrace ? `${resolvedErrorCode} · ${shortTrace}` : resolvedErrorCode;
}

export async function handleInteractionError(interaction: NexoInteraction | null | undefined, error: unknown, context: ErrorContext = {}): Promise<void> {
    const normalizedError = normalizeInteractionError(error, context);
    const errorType = categorizeError(normalizedError);
    const userMessage = getUserMessage(normalizedError, context);
    const { logData, traceId, resolvedErrorCode } = buildErrorLogData(interaction, normalizedError, errorType, context);

    logInteractionError(normalizedError, errorType, logData);

    // System errors get a reference code so users can report them and we can grep logs.
    const isUserError = USER_ERROR_TYPES.has(errorType) || (normalizedError as ErrorLike | null | undefined)?.context?.expected === true;
    const description = isUserError
        ? userMessage
        : `${userMessage}\n\n-# Ref: \`${buildErrorReference(resolvedErrorCode, traceId)}\``;

    const embed = buildUserErrorEmbed(errorType, description);
    await sendErrorResponse(interaction, embed, { ...context, traceId });
}

/**
 * Central error handler for non-interaction contexts (cron jobs, timers, event
 * side-effects). Logs with the same structured fields as interaction errors.
 */
export function handleTaskError(taskName: string, error: unknown, context: ErrorContext = {}): void {
    const err = error as ErrorLike | null | undefined;
    const errorType = categorizeError(error);
    const resolvedErrorCode = resolveErrorCode({ error, errorType, context });
    const errorMetadata = getErrorMetadata(resolvedErrorCode);

    logger.error(`Task Error [${taskName}] [${errorType.toUpperCase()}]`, {
        event: 'task.error',
        task: taskName,
        errorCode: resolvedErrorCode || ErrorCodes.TASK_ERROR,
        remediationHint: errorMetadata.remediation,
        severity: errorMetadata.severity,
        retryable: errorMetadata.retryable,
        type: errorType,
        error: err?.message || String(error),
        stack: err?.stack,
        context
    });
}

/**
 * Wrap a background task so it can never produce an unhandled rejection.
 * Usage: cron.schedule('* * * * *', runSafeTask('giveaways', () => checkGiveaways(client)))
 */
export function runSafeTask<A extends unknown[], R>(taskName: string, fn: (...args: A) => R, context: ErrorContext = {}): (...args: A) => Promise<Awaited<R> | null> {
    return async (...args: A): Promise<Awaited<R> | null> => {
        try {
            return await fn(...args);
        } catch (error) {
            handleTaskError(taskName, error, context);
            return null;
        }
    };
}

type InteractionProbe = {
    isCommand?: unknown;
    isButton?: unknown;
    isModalSubmit?: unknown;
    isStringSelectMenu?: unknown;
    isChatInputCommand?: unknown;
    _isPrefixCommand?: unknown;
};

export function withErrorHandling<A extends unknown[], R>(fn: (...args: A) => R, context: ErrorContext = {}): (...args: A) => Promise<Awaited<R> | null> {
    return async (...args: A): Promise<Awaited<R> | null> => {
        try {
            return await fn(...args);
        } catch (error) {
            const interaction = args.find((arg) =>
                arg && typeof arg === 'object' &&
                ((arg as InteractionProbe).isCommand || (arg as InteractionProbe).isButton || (arg as InteractionProbe).isModalSubmit
                    || (arg as InteractionProbe).isStringSelectMenu || (arg as InteractionProbe).isChatInputCommand || (arg as InteractionProbe)._isPrefixCommand)
            ) as NexoInteraction | undefined;

            // Slash commands are handled by interactionCreate — re-throw so the
            // central handler can attach trace context and command subtypes.
            if (interaction?.isChatInputCommand?.()) {
                throw error;
            }

            if (interaction) {
                await handleInteractionError(interaction, error, context);
            } else {
                logger.error('Error in non-interaction context:', error);
            }

            return null;
        }
    };
}

export function createError(message: string, type: ErrorType = ErrorTypes.UNKNOWN, userMessage: string | null = null, context: ErrorContext = {}): NexoBotError {
    const normalizedContext: ErrorContext = {
        ...context,
        errorCode: context?.errorCode || getDefaultErrorCodeByType(type)
    };

    return new NexoBotError(message, type, userMessage, normalizedContext);
}

export default {
    ErrorTypes,
    NexoBotError,
    categorizeError,
    getUserMessage,
    replyUserError,
    handleInteractionError,
    handleTaskError,
    runSafeTask,
    withErrorHandling,
    createError
};
