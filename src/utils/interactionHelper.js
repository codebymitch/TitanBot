import { logger } from './logger.js';

/**
 * Helper class for handling Discord interactions with proper error handling
 */
export class InteractionHelper {
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
                logger.warn(`Interaction ${interaction.id} already acknowledged, skipping defer`);
                return true;
            }

            // Check if interaction has expired before attempting to defer
            if (interaction.createdTimestamp && (Date.now() - interaction.createdTimestamp) > 14 * 60 * 1000) {
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
            if (interaction.createdTimestamp && (Date.now() - interaction.createdTimestamp) > 14 * 60 * 1000) {
                logger.warn(`Interaction ${interaction.id} has expired before edit, ignoring`);
                return false;
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
            if (interaction.createdTimestamp && (Date.now() - interaction.createdTimestamp) > 14 * 60 * 1000) {
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
     * @param {Object} errorEmbed - Error embed to use for failures
     * @returns {Promise<void>}
     */
    static async safeExecute(interaction, commandFunction, errorEmbed) {
        // Check if interaction has expired
        if (interaction.createdTimestamp && (Date.now() - interaction.createdTimestamp) > 14 * 60 * 1000) {
            logger.warn(`Interaction ${interaction.id} has expired, ignoring`);
            return;
        }

        // Try to defer the reply with a shorter timeout
        const deferStartTime = Date.now();
        const deferSuccess = await this.safeDefer(interaction);
        
        // If defer took too long, the interaction might be close to expiring
        if (Date.now() - deferStartTime > 3000) { // 3 second threshold
            logger.warn(`Interaction ${interaction.id} defer took too long (${Date.now() - deferStartTime}ms), command may expire`);
        }
        
        if (!deferSuccess) {
            // If defer failed due to expiration, don't execute the command
            logger.warn(`Interaction ${interaction.id} defer failed, skipping command execution`);
            return;
        }

        try {
            // Execute the command function
            await commandFunction();
        } catch (error) {
            logger.error('Error executing command:', error);
            
            // Try to send error response
            await this.safeEditReply(interaction, {
                embeds: [errorEmbed]
            });
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
