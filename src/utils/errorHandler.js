/**
 * Centralized Error Handling System
 * 
 * This module provides structured error handling for the TitanBot application.
 * 
 * PHILOSOPHY:
 * - All errors are categorized by type for consistent handling
 * - User-facing errors display friendly messages
 * - System errors are logged with full context
 * - Errors contain context information for debugging
 * 
 * USAGE:
 * - Throw TitanBotError for application-specific errors
 * - Use handleInteractionError for interaction errors
 * - Errors are automatically formatted and sent to user
 * 
 * ERROR TYPES:
 * - VALIDATION: Invalid user input
 * - PERMISSION: Missing access permissions
 * - CONFIGURATION: Missing/invalid configuration
 * - DATABASE: Database operation failure
 * - NETWORK: Network/external service failure
 * - DISCORD_API: Discord API error
 * - USER_INPUT: User input processing error
 * - RATE_LIMIT: Rate limit exceeded
 * - UNKNOWN: Unclassified error
 */

import { logger } from './logger.js';
import { createEmbed } from './embeds.js';
import { MessageFlags } from 'discord.js';




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
        default: "Please check your input and try again.",
        missing_required: "You're missing some required information. Please check the command options.",
        invalid_format: "The format you provided is incorrect. Please try again."
    },
    [ErrorTypes.PERMISSION]: {
        default: "I don't have permission to do that. Please check my server permissions.",
        user_permission: "You don't have permission to use this command.",
        bot_permission: "I need additional permissions to perform this action."
    },
    [ErrorTypes.CONFIGURATION]: {
        default: "Something is not configured correctly. Please contact an administrator.",
        missing_config: "This feature hasn't been set up yet. Please contact an administrator.",
        invalid_config: "The configuration is invalid. Please contact an administrator."
    },
    [ErrorTypes.DATABASE]: {
        default: "I'm having trouble with my database. Please try again in a moment.",
        connection_failed: "I'm having trouble connecting to my database. Please try again later.",
        timeout: "The operation took too long. Please try again."
    },
    [ErrorTypes.NETWORK]: {
        default: "I'm having network issues. Please try again in a moment.",
        timeout: "The request timed out. Please try again.",
        unreachable: "I can't reach the service right now. Please try again later."
    },
    [ErrorTypes.DISCORD_API]: {
        default: "I'm having trouble with Discord. Please try again in a moment.",
        rate_limit: "You're doing that too much. Please wait a moment and try again.",
        forbidden: "I'm not allowed to do that. Please check my permissions."
    },
    [ErrorTypes.USER_INPUT]: {
        default: "There was an issue with your request. Please try again.",
        invalid_user: "I couldn't find that user. Please check the user mention or ID.",
        invalid_channel: "I couldn't find that channel. Please check the channel mention or ID."
    },
    [ErrorTypes.RATE_LIMIT]: {
        default: "You're doing that too much. Please wait a moment and try again.",
        command_cooldown: "This command is on cooldown. Please wait before using it again.",
        global_rate_limit: "You're being rate limited by Discord. Please wait a moment."
    },
    [ErrorTypes.UNKNOWN]: {
        default: "Something went wrong. Please try again in a moment.",
        unexpected: "An unexpected error occurred. Please try again later."
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

    return messages.default;
}




export async function handleInteractionError(interaction, error, context = {}) {
    const errorType = categorizeError(error);
    const userMessage = getUserMessage(error, context);
    
    
    
    
    const isUserError = [
        ErrorTypes.VALIDATION,
        ErrorTypes.RATE_LIMIT,
        ErrorTypes.USER_INPUT,
        ErrorTypes.PERMISSION
    ].includes(errorType);
    
    const logData = {
        error: error.message,
        type: errorType,
        interaction: {
            type: interaction.type,
            commandName: interaction.commandName,
            customId: interaction.customId,
            userId: interaction.user.id,
            guildId: interaction.guildId,
            channelId: interaction.channelId
        },
        context
    };
    
    if (isUserError) {
        
        logger.debug(`User Error [${errorType.toUpperCase()}]: ${error.message}`, logData);
    } else {
        // System errors (database, network, etc.) - unexpected failures
        logger.error(`System Error [${errorType.toUpperCase()}]`, {
            ...logData,
            stack: error.stack
        });
    }

    const embed = createEmbed({
        title: getErrorTitle(errorType),
        description: userMessage,
        color: 'error',
        timestamp: true
    });

    if (errorType === ErrorTypes.RATE_LIMIT) {
        embed.addFields({
            name: "💡 Tip",
            value: "Rate limits help prevent spam. Wait a moment before trying again."
        });
    } else if (errorType === ErrorTypes.PERMISSION) {
        embed.addFields({
            name: "🔧 Need Help?",
            value: "Contact a server administrator if you believe this is an error."
        });
    } else if (errorType === ErrorTypes.CONFIGURATION) {
        embed.addFields({
            name: "📋 Configuration",
            value: "This feature needs to be configured by a server administrator."
        });
    }

    try {
        
        if (!interaction || !interaction.id) {
            logger.warn('Interaction was null or invalid when handling error');
            return;
        }

        
        if (interaction.createdTimestamp && (Date.now() - interaction.createdTimestamp) > 14 * 60 * 1000) {
            logger.warn('Interaction expired before error handler could send response');
            return;
        }

        const errorMessage = { 
            embeds: [embed]
        };
        
        if (!interaction.deferred && !interaction.replied) {
            errorMessage.flags = MessageFlags.Ephemeral;
        }
        
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    } catch (replyError) {
        
        if (replyError.code === 40060 || replyError.code === 10062) {
            logger.warn('Interaction already acknowledged or expired, cannot send error response:', replyError.code);
            return;
        }
        logger.error('Failed to send error response:', replyError);
    }
}




function getErrorTitle(errorType) {
    const titles = {
        [ErrorTypes.VALIDATION]: "❌ Invalid Input",
        [ErrorTypes.PERMISSION]: "🚫 Permission Denied",
        [ErrorTypes.CONFIGURATION]: "⚙️ Configuration Error",
        [ErrorTypes.DATABASE]: "🗄️ Database Error",
        [ErrorTypes.NETWORK]: "🌐 Network Error",
        [ErrorTypes.DISCORD_API]: "🔌 API Error",
        [ErrorTypes.USER_INPUT]: "💬 Input Error",
        [ErrorTypes.RATE_LIMIT]: "⏱️ Slow Down!",
        [ErrorTypes.UNKNOWN]: "❓ Unexpected Error"
    };
    
    return titles[errorType] || titles[ErrorTypes.UNKNOWN];
}




export function withErrorHandling(fn, context = {}) {
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (error) {
            const interaction = args.find(arg => 
                arg && typeof arg === 'object' && 
                (arg.isCommand || arg.isButton || arg.isModalSubmit || arg.isStringSelectMenu || arg.isChatInputCommand)
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
    return new TitanBotError(message, type, userMessage, context);
}

export default {
    ErrorTypes,
    TitanBotError,
    categorizeError,
    getUserMessage,
    handleInteractionError,
    withErrorHandling,
    createError
};




