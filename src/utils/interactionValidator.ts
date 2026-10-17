// interactionValidator.js

import { logger } from './logger.js';
import type {
    CommandInteraction,
    InteractionDeferUpdateOptions,
    MessageComponentInteraction,
    ModalBuilder,
} from 'discord.js';
import type { ErrorLike } from './errorHandler.js';
import type { AnyRepliableInteraction, ModalCapableInteraction } from './interactionHelper.js';

/** Interactions that support deferUpdate (components and modal submits). */
export type UpdatableInteraction = Exclude<AnyRepliableInteraction, CommandInteraction> | MessageComponentInteraction;

const EXPIRED_INTERACTION_CODE = 10062;
const INTERACTION_NOT_REPLIED_CODE = 40060;

export function isInteractionValid(interaction: AnyRepliableInteraction | null | undefined): boolean {
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

export async function safeDeferInteraction(interaction: UpdatableInteraction, options: InteractionDeferUpdateOptions = {}): Promise<boolean> {
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
    } catch (caught) {
        const error = caught as ErrorLike;
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

export async function safeShowModal(interaction: ModalCapableInteraction & { customId?: string }, modal: ModalBuilder): Promise<boolean> {
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
    } catch (caught) {
        const error = caught as ErrorLike;
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

type InteractionLike = { id?: unknown; token?: unknown; customId?: string; user?: { id?: string } };

export function withExpiredInteractionHandler<A extends unknown[], R>(handler: (...args: A) => R): (...args: A) => Promise<Awaited<R> | null> {
    return async (...args: A): Promise<Awaited<R> | null> => {
        try {
            return await handler(...args);
        } catch (caught) {
            const error = caught as ErrorLike;
            
            if (error.code === EXPIRED_INTERACTION_CODE || error.code === INTERACTION_NOT_REPLIED_CODE) {
                const interaction = args.find(arg => 
                    arg && typeof arg === 'object' && ((arg as InteractionLike).id && (arg as InteractionLike).token)
                ) as InteractionLike | undefined;
                
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