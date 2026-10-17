import type { SubcommandModule } from '../../../types/index.js';
import axios, { type AxiosError } from 'axios';
import { createEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

interface UrbanDefinition {
    word: string;
    definition: string;
    example: string;
    permalink: string;
    thumbs_up: number;
    thumbs_down: number;
    author?: string;
}

interface UrbanResponse {
    list?: UrbanDefinition[];
}

export default {
    async execute(interaction) {
        try {
            const term = interaction.options.getString('term')!;

            if (term.length < 2) {
                logger.warn('Urban command - term too short', {
                    userId: interaction.user.id,
                    term: term,
                    guildId: interaction.guildId
                });
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Bitte gib einen Begriff mit mindestens 2 Zeichen ein.' });
            }

            let deferTimer: ReturnType<typeof setTimeout> | null = null;
            const clearDeferTimer = () => {
                if (deferTimer) {
                    clearTimeout(deferTimer);
                    deferTimer = null;
                }
            };

            deferTimer = setTimeout(() => {
                InteractionHelper.safeDefer(interaction).catch((deferError) => {
                    logger.debug('Urban command defer fallback failed', {
                        error: deferError?.message,
                        interactionId: interaction.id,
                        commandName: 'urban'
                    });
                });
            }, 1500);

            const response = await axios.get<UrbanResponse>(
                `https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`,
                { timeout: 5000 }
            );
            clearDeferTimer();

            if (!response.data?.list?.length) {
                return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: `Keine Definitionen für „${term}“ im Urban Dictionary gefunden.` });
            }

            const definition = response.data.list![0];
            const cleanDefinition = definition.definition.replace(/\[|\]/g, '');
            const cleanExample = definition.example.replace(/\[|\]/g, '');

            const formattedDefinition = cleanDefinition
                .replace(/\n\s*\n/g, '\n\n')
                .slice(0, 2000);

            const formattedExample = cleanExample
                ? `*"${cleanExample.replace(/\n/g, ' ').slice(0, 500)}..."*`
                : '*Kein Beispiel vorhanden*';

            const embed = createEmbed({
                title: definition.word,
                description: formattedDefinition,
                color: 'info'
            })
            .setURL(definition.permalink)
            .addFields(
                {
                    name: 'Beispiel',
                    value: formattedExample,
                    inline: false
                },
                {
                    name: 'Statistik',
                    value: `${definition.thumbs_up.toLocaleString()} • ${definition.thumbs_down.toLocaleString()}`,
                    inline: true
                },
                {
                    name: 'Autor',
                    value: definition.author || 'Anonym',
                    inline: true
                }
            )
            .setFooter({
                text: 'Urban Dictionary',
                iconURL: 'https://i.imgur.com/8aQrX3a.png'
            });

            await InteractionHelper.safeReply(interaction, { embeds: [embed] });

            logger.info('Urban Dictionary definition retrieved', {
                userId: interaction.user.id,
                term: term,
                guildId: interaction.guildId,
                commandName: 'urban'
            });

        } catch (error) {
            const err = error as AxiosError;
            logger.error('Urban Dictionary error', {
                error: err.message,
                stack: err.stack,
                userId: interaction.user.id,
                term: interaction.options.getString('term'),
                guildId: interaction.guildId,
                apiStatus: err.response?.status,
                commandName: 'urban'
            });

            if (err.response?.status === 404 || !err.response) {
                await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: `Keine Definitionen für „${interaction.options.getString('term')}“ im Urban Dictionary gefunden.` });
            } else if (err.response?.status === 429) {
                await replyUserError(interaction, { type: ErrorTypes.RATE_LIMIT, message: 'Zu viele Anfragen an das Urban Dictionary. Bitte versuch es in ein paar Minuten noch einmal.' });
            } else {
                await handleInteractionError(interaction, error, {
                    commandName: 'urban',
                    source: 'urban_dictionary_api'
                });
            }
        }
    },
} satisfies SubcommandModule;
