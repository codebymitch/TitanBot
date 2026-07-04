// interactionValidator.js

import { logger } from './logger.js';

const EXPIRED_INTERACTION_CODE = 10062;
const INTERACTION_NOT_REPLIED_CODE = 40060;

export function isInteractionValid(interaction) {
    if (!interaction || !interaction.id || !interaction.token) {
        return false;
    }

    if (interaction.deferred || interaction.replied) {
        return true; 
    }

    const ageMs = Date.now() - interaction.createdTimestamp;
    if (ageMs > 2800) { 
        return false;
    }
    
    return true;
}

export async function safeDeferInteraction(interaction, options = {}) {
    try {
        if (!isInteractionValid(interaction)) {
            logger.warn('Interaction expired before deferral', {
                event: 'interaction.expired_before_defer',
                interactionId: interaction?.id,
                age: Date.now() - (interaction?.createdTimestamp || 0)
            });
            return false;
        }

        if (interaction.deferred) {
            return true;
        }

        await interaction.deferUpdate(options);
        return true;
    } catch (error) {
        if (error.code === EXPIRED_INTERACTION_CODE || error.code === INTERACTION_NOT_REPLIED_CODE) {
            logger.warn('Interaction expired during deferral', {
                event: 'interaction.expired_during_defer',
                errorCode: error.code,
                customId: interaction?.customId,
                userId: interaction?.user?.id
            });
            return false;
        }
        throw error;
    }
}

export async function safeShowModal(interaction, modal) {
    try {
        if (!isInteractionValid(interaction)) {
            logger.warn('Interaction expired before modal show', {
                event: 'interaction.expired_before_modal',
                interactionId: interaction?.id,
                modalId: modal?.data?.custom_id
            });
            return false;
        }

        if (interaction.deferred || interaction.replied) {
            logger.warn('Attempted to show modal on already-responded interaction', {
                event: 'interaction.already_responded_modal',
                customId: interaction?.customId
            });
            return false;
        }

        await interaction.showModal(modal);
        return true;
    } catch (error) {
        if (error.code === EXPIRED_INTERACTION_CODE || error.code === INTERACTION_NOT_REPLIED_CODE) {
            logger.warn('Interaction expired during modal show', {
                event: 'interaction.expired_during_modal',
                errorCode: error.code,
                customId: interaction?.customId,
                userId: interaction?.user?.id
            });
            return false;
        }
        throw error;
    }
}

export function withExpiredInteractionHandler(handler) {
    return async (...args) => {
        try {
            return await handler(...args);
        } catch (error) {
            
            if (error.code === EXPIRED_INTERACTION_CODE || error.code === INTERACTION_NOT_REPLIED_CODE) {
                const interaction = args.find(arg => 
                    arg && typeof arg === 'object' && (arg.id && arg.token)
                );
                
                logger.warn('Handler failed due to expired interaction', {
                    event: 'interaction.handler_expired',
                    errorCode: error.code,
                    customId: interaction?.customId,
                    userId: interaction?.user?.id,
                    handlerName: handler.name || 'anonymous'
                });

                return null;
            }

            throw error;
        }
    };
}

export default {
    isInteractionValid,
    safeDeferInteraction,
    safeShowModal,
    withExpiredInteractionHandler,
    EXPIRED_INTERACTION_CODE,
    INTERACTION_NOT_REPLIED_CODE
};