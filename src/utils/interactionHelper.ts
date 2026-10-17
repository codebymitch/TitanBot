// interactionHelper.js

import { logger } from './logger.js';
import { MessageFlags } from 'discord.js';
import type {
    APIModalInteractionResponseCallbackData,
    CommandInteraction,
    EmbedBuilder,
    InteractionDeferReplyOptions,
    InteractionEditReplyOptions,
    InteractionReplyOptions,
    JSONEncodable,
    Message,
    MessageComponentInteraction,
    ModalComponentData,
    ModalSubmitInteraction,
    RepliableInteraction,
} from 'discord.js';
import { handleInteractionError, createError, ErrorTypes } from './errorHandler.js';
import type { ErrorLike } from './errorHandler.js';
import { ResponseCoordinator } from './responseCoordinator.js';
import type { CoordinatedInteraction, PayloadResponder, ResponsePayload } from './responseCoordinator.js';
import type { TraceContext } from './logger.js';
import type { GuildConfig, NexoClient } from '../types/index.js';

/** Properties NexoBot attaches to interaction objects at runtime. */
export interface InteractionExtras {
    _isPrefixCommand?: boolean;
    _responseCoordinator?: ResponseCoordinator;
    _replyMessage?: Message | null;
    __nexoResponsePatched?: boolean;
    traceContext?: TraceContext;
    traceId?: string;
}

/** Every repliable discord.js interaction, including the abstract bases used in generic handlers. */
export type AnyRepliableInteraction = RepliableInteraction | CommandInteraction | MessageComponentInteraction;

/** Any interaction the helpers can answer (slash, context menu, button, select, modal, prefix mock). */
export type NexoInteraction = AnyRepliableInteraction & InteractionExtras;

/** Interactions that support showModal (everything repliable except modal submits). */
export type ModalCapableInteraction = Exclude<AnyRepliableInteraction, ModalSubmitInteraction> & InteractionExtras;

export type ModalPayload =
    | JSONEncodable<APIModalInteractionResponseCallbackData>
    | ModalComponentData
    | APIModalInteractionResponseCallbackData;

/** An interaction whose reply methods get wrapped by patchInteractionResponses. */
type PatchableInteraction = CoordinatedInteraction & { __nexoResponsePatched?: boolean };

export interface SafeExecuteOptions {
    autoDefer?: boolean;
    deferOptions?: InteractionDeferReplyOptions;
}

const INTERACTION_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_DEFER_OPTIONS = { flags: MessageFlags.Ephemeral };
const INTERACTION_UNAVAILABLE_CODES: ReadonlySet<unknown> = new Set([10062, 40060, 50027]);

function isInteractionUnavailableError(error: unknown): boolean {
    return INTERACTION_UNAVAILABLE_CODES.has((error as ErrorLike | null | undefined)?.code);
}

function sanitizeEditReplyOptions(options: ResponsePayload = {}): ResponsePayload {
    if (!options || typeof options !== 'object') {
        return options;
    }

    // Object payloads are reply/edit option bags; read them through the reply shape.
    const { flags, ephemeral, ...replyRest } = options as InteractionReplyOptions;
    const rest: InteractionEditReplyOptions = replyRest;

    // Number() mirrors the implicit numeric coercion of `&` for BitField objects.
    if (flags && (Number(flags) & MessageFlags.IsComponentsV2)) {
        rest.flags = MessageFlags.IsComponentsV2;
    }
    return rest;
}

export class InteractionHelper {
    static getCoordinator(interaction: CoordinatedInteraction | null | undefined): ResponseCoordinator | null {
        return interaction?._responseCoordinator || null;
    }

    static patchInteractionResponses(interaction: PatchableInteraction): void {
        if (!interaction || interaction.__nexoResponsePatched) {
            return;
        }

        const originalReply = interaction.reply?.bind(interaction);
        const originalEditReply = interaction.editReply?.bind(interaction);
        const originalFollowUp = interaction.followUp?.bind(interaction);

        if (!originalReply || !originalEditReply || !originalFollowUp) {
            return;
        }

        interaction.reply = async (options: ResponsePayload) => {
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

        interaction.__nexoResponsePatched = true;
    }

    static isInteractionValid(interaction: NexoInteraction | null | undefined): boolean {
        if (!interaction || typeof interaction !== 'object') return false;
        if (!interaction.id || typeof interaction.id !== 'string') return false;

        if (!interaction.user || typeof interaction.user !== 'object') return false;

        if (interaction.createdTimestamp && (Date.now() - interaction.createdTimestamp) > INTERACTION_TIMEOUT_MS) {
            return false;
        }

        return true;
    }

    static async ensureReady(interaction: NexoInteraction, deferOptions: InteractionDeferReplyOptions = { flags: MessageFlags.Ephemeral }): Promise<boolean> {
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

    static async safeDefer(interaction: NexoInteraction, options: InteractionDeferReplyOptions = {}): Promise<boolean> {
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
        } catch (caught) {
            const error = caught as ErrorLike;
            if (isInteractionUnavailableError(error)) {
                logger.warn(`Interaction ${interaction.id} unavailable during defer:`, error.message);
                return false;
            }
            if (error.name === 'InteractionAlreadyReplied' || error.code === 40060) {
                logger.warn(`Interaction ${interaction.id} already acknowledged during defer:`, error.message);
                interaction.replied = true;
                return true;
            }
            logger.error('Failed to defer reply:', error);
            return false;
        }
    }

    static async safeEditReply(interaction: NexoInteraction, options: ResponsePayload): Promise<boolean> {
        const responder: PayloadResponder = interaction;
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

            await responder.editReply(sanitizeEditReplyOptions(options));
            return true;
        } catch (caught) {
            const error = caught as ErrorLike;
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
                    await responder.followUp(options);
                    return true;
                } catch (followUpError) {
                    if (isInteractionUnavailableError(followUpError)) {
                        logger.warn(`Interaction ${interaction.id} unavailable during followUp:`, (followUpError as ErrorLike).message);
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

    static async safeReply(interaction: NexoInteraction, options: ResponsePayload): Promise<boolean> {
        const responder: PayloadResponder = interaction;
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
                await responder.editReply(sanitizeEditReplyOptions(options));
                return true;
            }

            if (interaction.replied) {
                await responder.followUp(options);
                return true;
            }

            await responder.reply(options);
            return true;
        } catch (caught) {
            const error = caught as ErrorLike;
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

    static async safeShowModal(interaction: ModalCapableInteraction, modal: ModalPayload): Promise<boolean> {
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
                logger.warn(`Interaction ${interaction.id} unavailable during showModal:`, (error as ErrorLike).message);
                return false;
            }
            logger.error('Failed to show modal:', error);
            return false;
        }
    }

    static async safeExecute(
        interaction: NexoInteraction,
        commandFunction: () => unknown,
        errorEmbed: string | EmbedBuilder | null | undefined,
        options: SafeExecuteOptions = {},
    ): Promise<void> {
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
                ? createError((error as ErrorLike).message || 'Command failed', ErrorTypes.UNKNOWN, errorEmbed, { expected: true })
                : error;

            await handleInteractionError(interaction, errorToHandle, { source: 'interactionHelper.safeExecute' });
        }
    }

    static async universalReply(interaction: NexoInteraction, options: ResponsePayload): Promise<unknown> {
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

        // Reply flags are forwarded to deferReply unchanged, as in the JS original.
        const replyFlags = (options as InteractionReplyOptions).flags;
        const isReady = await this.ensureReady(interaction, replyFlags ? { flags: replyFlags as InteractionDeferReplyOptions['flags'] } : {});
        if (!isReady) {
            return false;
        }

        if (interaction.deferred) {
            return await this.safeEditReply(interaction, options);
        }

        return await this.safeReply(interaction, options);
    }
}

type SafeExecuteMethod = (
    this: unknown,
    interaction: NexoInteraction,
    config: GuildConfig | null,
    client: NexoClient,
) => Promise<unknown>;

export function withSafeExecuteDecorator(
    target: object,
    propertyName: string,
    descriptor: TypedPropertyDescriptor<SafeExecuteMethod>,
): TypedPropertyDescriptor<SafeExecuteMethod> {
    const originalMethod = descriptor.value!;

    descriptor.value = async function(this: unknown, interaction: NexoInteraction, config: GuildConfig | null, client: NexoClient) {
        await InteractionHelper.safeExecute(
            interaction,
            () => originalMethod.call(this, interaction, config, client),
            null,
            { autoDefer: !interaction._isPrefixCommand },
        );
    };

    return descriptor;
}
