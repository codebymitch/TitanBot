import { ComponentType, EmbedBuilder } from 'discord.js';
import type {
    ButtonInteraction,
    ChatInputCommandInteraction,
    InteractionCollector,
    InteractionEditReplyOptions,
    InteractionReplyOptions,
    MessageComponentInteraction,
    StringSelectMenuInteraction,
} from 'discord.js';
import { getColor } from '../config/bot.js';
import { NexoBotError, ErrorTypes, replyUserError } from './errorHandler.js';
import { InteractionHelper } from './interactionHelper.js';
import { logger } from './logger.js';

export type CustomIdMatcher = string | string[] | ((customId: string) => boolean);

export interface DashboardSessionOptions {
    interaction: ChatInputCommandInteraction;
    embeds?: InteractionEditReplyOptions['embeds'];
    components?: InteractionEditReplyOptions['components'];
    flags?: InteractionReplyOptions['flags'];
    timeoutMs?: number;
    selectMenuId?: string;
    buttonMatcher?: CustomIdMatcher;
    onSelect?: (selectInteraction: StringSelectMenuInteraction) => Promise<unknown>;
    onButton?: (buttonInteraction: ButtonInteraction) => Promise<unknown>;
    onTimeout?: (interaction: ChatInputCommandInteraction) => Promise<unknown>;
}

export interface DashboardSession {
    stop: () => void;
    replyMessageId: string | undefined;
}

function matchesCustomId(customId: string, matcher: CustomIdMatcher): boolean {
    if (typeof matcher === 'function') return matcher(customId);
    if (Array.isArray(matcher)) return matcher.includes(customId);
    return customId === matcher;
}

function wrapHandler<I extends MessageComponentInteraction>(
    handler: (componentInteraction: I) => Promise<unknown>,
    interactionLabel = 'dashboard',
): (componentInteraction: I) => Promise<void> {
    return async (componentInteraction: I) => {
        try {
            await handler(componentInteraction);
        } catch (error) {
            if ((error as { code?: unknown } | null | undefined)?.code === 40060) return;

            if (error instanceof NexoBotError) {
                logger.debug(`${interactionLabel} error: ${error.message}`);
            } else {
                logger.error(`Unexpected ${interactionLabel} error:`, error);
            }

            const errorMessage =
                error instanceof NexoBotError
                    ? error.userMessage || 'Beim Verarbeiten deiner Auswahl ist ein Fehler aufgetreten.'
                    : 'Beim Aktualisieren der Konfiguration ist ein unerwarteter Fehler aufgetreten.';

            if (!componentInteraction.replied && !componentInteraction.deferred) {
                await componentInteraction.deferUpdate().catch(() => {});
            }

            await replyUserError(componentInteraction, {
                type: ErrorTypes.CONFIGURATION,
                message: errorMessage,
            }).catch(() => {});
        }
    };
}

/**
 * Shared select + button collector lifecycle for admin dashboards.
 */
export async function startDashboardSession({
    interaction,
    embeds,
    components,
    flags,
    timeoutMs = 600_000,
    selectMenuId,
    buttonMatcher,
    onSelect,
    onButton,
    onTimeout,
}: DashboardSessionOptions): Promise<DashboardSession> {
    await InteractionHelper.safeEditReply(interaction, { embeds, components, flags });

    const replyMessage = await interaction.fetchReply().catch(() => null);
    const replyMessageId = replyMessage?.id;

    const belongsToDashboard = (componentInteraction: MessageComponentInteraction) =>
        componentInteraction.user.id === interaction.user.id &&
        (!replyMessageId || componentInteraction.message.id === replyMessageId);

    const collectors: Array<
        | InteractionCollector<StringSelectMenuInteraction>
        | InteractionCollector<ButtonInteraction>
    > = [];

    if (selectMenuId && onSelect) {
        const selectCollector = interaction.channel!.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            filter: (i) => belongsToDashboard(i) && i.customId === selectMenuId,
            time: timeoutMs,
        });

        selectCollector.on('collect', wrapHandler(onSelect, 'dashboard select'));
        collectors.push(selectCollector);
    }

    if (buttonMatcher && onButton) {
        const buttonCollector = interaction.channel!.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: (i) => belongsToDashboard(i) && matchesCustomId(i.customId, buttonMatcher),
            time: timeoutMs,
        });

        buttonCollector.on('collect', wrapHandler(onButton, 'dashboard button'));
        collectors.push(buttonCollector);
    }

    const stopAll = () => collectors.forEach((collector) => collector.stop());

    if (collectors.length > 0) {
        collectors[0].on('end', async (_collected, reason) => {
            stopAll();
            if (reason !== 'time') return;

            if (onTimeout) {
                await onTimeout(interaction).catch(() => {});
                return;
            }

            const timeoutEmbed = new EmbedBuilder()
                .setTitle('Dashboard abgelaufen')
                .setDescription(
                    'Dieses Dashboard wurde wegen Inaktivität geschlossen. Führe den Command erneut aus, um weiterzumachen.',
                )
                .setColor(getColor('error'));

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [timeoutEmbed],
                components: [],
                flags,
            }).catch(() => {});
        });
    }

    return { stop: stopAll, replyMessageId };
}
