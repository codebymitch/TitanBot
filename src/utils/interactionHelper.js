import { logger } from './logger.js';
import { MessageFlags } from 'discord.js';
import { handleInteractionError } from './errorHandler.js';


const INTERACTION_TIMEOUT_MS = 15 * 60 * 1000; 
const DEFAULT_DEFER_OPTIONS = { flags: MessageFlags.Ephemeral };

function sanitizeEditReplyOptions(options = {}) {
    if (!options || typeof options !== 'object') {
        return options;
    }

    const { flags, ephemeral, ...rest } = options;
    return rest;
}




export class InteractionHelper {
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
                if (!interaction.deferred && !interaction.replied) {
                    return await originalReply(options);
                }

                if (interaction.deferred && !interaction.replied) {
                    return await originalEditReply(sanitizeEditReplyOptions(options));
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

        return await this.safeDefer(interaction, deferOptions);
    }

    





    static async safeDefer(interaction, options = {}) {
        try {
            if (interaction.deferred || interaction.replied) {
                return true;
            }

            if (!this.isInteractionValid(interaction)) {
                logger.warn(`Interaction ${interaction.id} has expired before defer, ignoring`);
                return false;
            }
            
            await interaction.deferReply(options);
            return true;
        } catch (error) {
if (error.code === 10062) {
                logger.warn(`Interaction ${interaction.id} expired during defer:`, error.message);
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
            if (!this.isInteractionValid(interaction)) {
                logger.warn(`Interaction ${interaction.id} has expired before edit, ignoring`);
                return false;
            }
            
            if (!interaction.replied && !interaction.deferred) {
                logger.debug(`Interaction ${interaction.id} not deferred, using reply fallback instead of edit`);
                return await this.safeReply(interaction, options);
            }
            
            await interaction.editReply(sanitizeEditReplyOptions(options));
            return true;
        } catch (error) {
if (error.code === 10062) {
                logger.warn(`Interaction ${interaction.id} expired during edit:`, error.message);
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
            logger.error('Failed to edit reply:', error);
            return false;
        }
    }

    





    static async safeReply(interaction, options) {
        try {
            if (!this.isInteractionValid(interaction)) {
                logger.warn(`Interaction ${interaction.id} has expired before reply, ignoring`);
                return false;
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
if (error.code === 10062) {
                logger.warn(`Interaction ${interaction.id} expired during reply:`, error.message);
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

    







    static async safeExecute(interaction, commandFunction, errorEmbed, options = {}) {
        const { autoDefer = true, deferOptions = { flags: MessageFlags.Ephemeral } } = options;
        
        if (!this.isInteractionValid(interaction)) {
            logger.warn(`Interaction ${interaction.id} has expired, ignoring`);
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

            if (!errorEmbed) {
                await handleInteractionError(interaction, error, { source: 'interactionHelper.safeExecute' });
                return;
            }

            let errorResponse;
            if (typeof errorEmbed === 'string') {
                const { errorEmbed: createErrorEmbed } = await import('./embeds.js');
                errorResponse = { embeds: [createErrorEmbed(errorEmbed, error)] };
            } else if (errorEmbed && typeof errorEmbed === 'object') {
                errorResponse = { embeds: [errorEmbed] };
            } else {
                const { errorEmbed: createErrorEmbed } = await import('./embeds.js');
                errorResponse = { embeds: [createErrorEmbed('Command execution failed.', error)] };
            }

            const editSuccess = await this.safeEditReply(interaction, errorResponse);
            if (!editSuccess) {
                logger.warn(`Failed to send error response for interaction ${interaction.id}, interaction may have expired`);
            }
        }
    }

    





    static async universalReply(interaction, options) {
        const isReady = await this.ensureReady(interaction, options.flags ? { flags: options.flags } : {});
        if (!isReady) {
            return false;
        }

        if (interaction.deferred) {
            return await this.safeEditReply(interaction, options);
        } else {
            return await this.safeReply(interaction, options);
        }
    }
}







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


