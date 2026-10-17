import type { SubcommandModule } from '../../../types/index.js';
import axios, { type AxiosError } from 'axios';
import { createEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

interface DictionaryDefinition {
    definition: string;
    example?: string;
}

interface DictionaryMeaning {
    partOfSpeech?: string;
    definitions: DictionaryDefinition[];
}

interface DictionaryEntry {
    word: string;
    phonetic?: string;
    meanings: DictionaryMeaning[];
}

export default {
    async execute(interaction) {
        try {
            const deferred = await InteractionHelper.safeDefer(interaction);
            if (!deferred) {
                return;
            }

            const word = interaction.options.getString('word')!;

            if (word.length < 2) {
                logger.warn('Define command - word too short', {
                    userId: interaction.user.id,
                    word: word,
                    guildId: interaction.guildId
                });
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Bitte gib ein Wort mit mindestens 2 Zeichen ein.' });
            }

            const response = await axios.get<DictionaryEntry[]>(
                `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
                { timeout: 5000 }
            );

            if (!response.data || response.data.length === 0) {
                return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: `Keine Definitionen für „${word}“ gefunden.` });
            }

            const data = response.data[0];
            const embed = createEmbed({
                title: data.word,
                description: data.phonetic ? `*${data.phonetic}*` : '',
                color: 'success'
            });

            data.meanings.slice(0, 5).forEach(meaning => {
                const definitions = meaning.definitions
                    .slice(0, 3)
                    .map((def, idx) => {
                        let text = `${idx + 1}. ${def.definition}`;
                        if (def.example) {
                            text += `\n *Beispiel: ${def.example}*`;
                        }
                        return text;
                    })
                    .join('\n\n');

                if (definitions) {
                    embed.addFields({
                        name: `**${meaning.partOfSpeech || 'Definition'}**`,
                        value: definitions,
                        inline: false
                    });
                }
            });

            embed.setFooter({ text: 'Bereitgestellt von der Free Dictionary API' });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

            logger.info('Dictionary definition retrieved', {
                userId: interaction.user.id,
                word: word,
                guildId: interaction.guildId,
                commandName: 'define'
            });

        } catch (error) {
            const err = error as AxiosError;
            logger.error('Dictionary lookup error', {
                error: err.message,
                stack: err.stack,
                userId: interaction.user.id,
                word: interaction.options.getString('word'),
                guildId: interaction.guildId,
                commandName: 'define'
            });

            if (err.response?.status === 404) {
                await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: `Keine Definitionen für „${interaction.options.getString('word')}“ gefunden.` });
            } else {
                await handleInteractionError(interaction, error, {
                    commandName: 'define',
                    source: 'dictionary_api'
                });
            }
        }
    },
} satisfies SubcommandModule;
