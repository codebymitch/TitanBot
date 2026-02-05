import { logger } from './logger.js';
import { MessageFlags } from 'discord.js';

/**
 * Helper class for handling Discord interactions with proper error handling
 */
export class InteractionHelper {
    /**
     * Check if interaction is still valid (not expired)
     * @param {Interaction} interaction - Discord interaction
     * @returns {boolean} - Whether interaction is still valid
     */
    static isInteractionValid(interaction) {
        if (!interaction || !interaction.id) return false;
        
        // Check if interaction has expired (15 minutes)
        if (interaction.createdTimestamp && (Date.now() - interaction.createdTimestamp) > 14 * 60 * 1000) {
            return false;
        }
        
        return true;
    }

    /**
     * Ensure interaction is in a state that can be replied to
     * @param {Interaction} interaction - Discord interaction
     * @param {Object} deferOptions - Options for deferReply if needed
     * @returns {Promise<boolean>} - Whether interaction is ready for replies
     */
    static async ensureReady(interaction, deferOptions = { flags: MessageFlags.Ephemeral }) {
        if (!this.isInteractionValid(interaction)) {
            return false;
        }

        // If already replied or deferred, we're ready
        if (interaction.replied || interaction.deferred) {
            return true;
        }

        // Otherwise, defer the interaction
        return await this.safeDefer(interaction, deferOptions);
    }

    /**
     * Safely defer a reply with error handling
     * @param {Interaction} interaction - Discord interaction
     * @param {Object} options - Options forwarded to deferReply (optional)
     * @returns {Promise<boolean>} - Whether defer was successful
     */
    static async safeDefer(interaction, options = {}) {
        try {
            // If already acknowledged, nothing to defer — proceed
            if (interaction.deferred || interaction.replied) {
                return true;
            }

            // Check if interaction has expired before attempting to defer
            if (!this.isInteractionValid(interaction)) {
                logger.warn(`Interaction ${interaction.id} has expired before defer, ignoring`);
                return false;
            }
            
            await interaction.deferReply(options);
            return true;
        } catch (error) {
            // Check if error is due to expired interaction
            if (error.code === 10062) { // Unknown interaction
                logger.warn(`Interaction ${interaction.id} expired during defer:`, error.message);
                return false;
            }
            // If interaction was already replied/acknowledged, log and proceed (command can still edit reply)
            if (error.name === 'InteractionAlreadyReplied' || error.code === 40060) {
                logger.warn(`Interaction ${interaction.id} already acknowledged during defer:`, error.message);
                return true;
            }
            logger.error('Failed to defer reply:', error);
            return false;
        }
    }

    /**
     * Safely edit a reply with error handling
     * @param {Interaction} interaction - Discord interaction
     * @param {Object} options - Reply options
     * @returns {Promise<boolean>} - Whether edit was successful
     */
    static async safeEditReply(interaction, options) {
        try {
            // Check if interaction has expired before attempting to edit
            if (!this.isInteractionValid(interaction)) {
                logger.warn(`Interaction ${interaction.id} has expired before edit, ignoring`);
                return false;
            }
            
            // If interaction hasn't been replied to, try to reply instead
            if (!interaction.replied && !interaction.deferred) {
                logger.warn(`Interaction ${interaction.id} not deferred, attempting reply instead of edit`);
                return await this.safeReply(interaction, options);
            }
            
            await interaction.editReply(options);
            return true;
        } catch (error) {
            // Check if error is due to expired interaction
            if (error.code === 10062) { // Unknown interaction
                logger.warn(`Interaction ${interaction.id} expired during edit:`, error.message);
                return false;
            }
            if (error.code === 40060) { // Interaction has already been acknowledged
                logger.warn(`Interaction ${interaction.id} already acknowledged during edit:`, error.message);
                return false;
            }
            // If interaction hasn't been replied to, try to reply instead of edit
            if (error.name === 'InteractionNotReplied' || error.message.includes('not been sent or deferred')) {
                logger.warn(`Interaction ${interaction.id} not replied, attempting reply instead of edit:`, error.message);
                return await this.safeReply(interaction, options);
            }
            logger.error('Failed to edit reply:', error);
            return false;
        }
    }

    /**
     * Safely reply to an interaction with error handling
     * @param {Interaction} interaction - Discord interaction
     * @param {Object} options - Reply options
     * @returns {Promise<boolean>} - Whether reply was successful
     */
    static async safeReply(interaction, options) {
        try {
            // Check if interaction has expired before attempting to reply
            if (!this.isInteractionValid(interaction)) {
                logger.warn(`Interaction ${interaction.id} has expired before reply, ignoring`);
                return false;
            }
            
            await interaction.reply(options);
            return true;
        } catch (error) {
            // Check if error is due to expired interaction
            if (error.code === 10062) { // Unknown interaction
                logger.warn(`Interaction ${interaction.id} expired during reply:`, error.message);
                return false;
            }
            if (error.code === 40060) { // Interaction has already been acknowledged
                logger.warn(`Interaction ${interaction.id} already acknowledged during reply:`, error.message);
                return false;
            }
            logger.error('Failed to reply:', error);
            return false;
        }
    }

    /**
     * Safely handle command execution with comprehensive error handling
     * @param {Interaction} interaction - Discord interaction
     * @param {Function} commandFunction - The command function to execute
     * @param {Object|string} errorEmbed - Error embed to use for failures
     * @param {Object} options - Additional options (autoDefer, deferOptions)
     * @returns {Promise<void>}
     */
    static async safeExecute(interaction, commandFunction, errorEmbed, options = {}) {
        const { autoDefer = true, deferOptions = { flags: MessageFlags.Ephemeral } } = options;
        
        // Check if interaction has expired
        if (!this.isInteractionValid(interaction)) {
            logger.warn(`Interaction ${interaction.id} has expired, ignoring`);
            return;
        }

        // Auto-defer if enabled and interaction is not already acknowledged
        if (autoDefer && !interaction.replied && !interaction.deferred) {
            const deferStartTime = Date.now();
            const deferSuccess = await this.safeDefer(interaction, deferOptions);
            
            // If defer took too long, the interaction might be close to expiring
            if (Date.now() - deferStartTime > 3000) { // 3 second threshold
                logger.warn(`Interaction ${interaction.id} defer took too long (${Date.now() - deferStartTime}ms), command may expire`);
            }
            
            if (!deferSuccess) {
                // If defer failed due to expiration, don't execute the command
                logger.warn(`Interaction ${interaction.id} defer failed, skipping command execution`);
                return;
            }
        }

        try {
            // Execute the command function
            await commandFunction();
        } catch (error) {
            logger.error('Error executing command:', error);
            
            // Prepare error response
            let errorResponse;
            if (typeof errorEmbed === 'string') {
                // If errorEmbed is a string, create an error embed with it
                const { errorEmbed: createErrorEmbed } = await import('./embeds.js');
                errorResponse = { embeds: [createErrorEmbed(errorEmbed, error)] };
            } else if (errorEmbed && typeof errorEmbed === 'object') {
                // If errorEmbed is already an embed object, use it directly
                errorResponse = { embeds: [errorEmbed] };
            } else {
                // Fallback to a basic error message
                const { errorEmbed: createErrorEmbed } = await import('./embeds.js');
                errorResponse = { embeds: [createErrorEmbed('Command execution failed.', error)] };
            }
            
            // Try to send error response
            const editSuccess = await this.safeEditReply(interaction, errorResponse);
            if (!editSuccess) {
                logger.warn(`Failed to send error response for interaction ${interaction.id}, interaction may have expired`);
            }
        }
    }

    /**
     * Universal reply method that handles all interaction states
     * @param {Interaction} interaction - Discord interaction
     * @param {Object} options - Reply options
     * @returns {Promise<boolean>} - Whether reply was successful
     */
    static async universalReply(interaction, options) {
        // Ensure interaction is ready for replies
        const isReady = await this.ensureReady(interaction, options.flags ? { flags: options.flags } : {});
        if (!isReady) {
            return false;
        }

        // Use appropriate reply method based on interaction state
        if (interaction.deferred) {
            return await this.safeEditReply(interaction, options);
        } else {
            return await this.safeReply(interaction, options);
        }
    }
}

/**
 * Decorator for wrapping command execute methods with error handling
 * @param {Function} target - The command method
 * @param {string} propertyName - The method name
 * @param {PropertyDescriptor} descriptor - The method descriptor
 */
export function withErrorHandling(target, propertyName, descriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function(interaction, config, client) {
        await InteractionHelper.safeExecute(
            interaction,
            () => originalMethod.call(this, interaction, config, client),
            { title: 'Command Error', description: 'Failed to execute command. Please try again later.' }
        );
    };

    return descriptor;
}
