import { createEmbed } from '../../utils/embeds.js';
import { createAllCommandsMenu } from './helpSelectMenus.js';
import { createInitialHelpMenu } from '../../commands/Core/help.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import type { TopLevelComponent } from 'discord.js';
import type { ButtonHandler } from '../../types/index.js';

const BACK_BUTTON_ID = "help-back-to-main";
const PAGINATION_PREFIX = "help-page";
const BUG_REPORT_BUTTON_ID = "help-bug-report";

export const helpBackButton = {
    name: BACK_BUTTON_ID,
    async execute(interaction, client) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }

            const { embeds, components } = await createInitialHelpMenu(client);
            await interaction.editReply({
                embeds,
                components,
            });
        } catch (error) {
            const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
            if (code === 40060 || code === 10062) {
                logger.warn('Help back button interaction already acknowledged or expired.', {
                    event: 'interaction.help.button.unavailable',
                    errorCode: String(code),
                    customId: interaction.customId,
                    interactionId: interaction.id,
                });
                return;
            }

            throw error;
        }
    },
} satisfies ButtonHandler;

export const helpBugReportButton = {
    name: BUG_REPORT_BUTTON_ID,
    async execute(interaction, client) {
        const githubButton = new ButtonBuilder()
            .setLabel('🐛 Bug auf GitHub melden')
            .setStyle(ButtonStyle.Link)
            .setURL('https://github.com/Robertwlt03/NexoBot/issues');

        const bugRow = new ActionRowBuilder<ButtonBuilder>().addComponents(githubButton);

        const bugReportEmbed = createEmbed({
            title: '🐛 Bug melden',
            description: 'Du hast einen Bug gefunden? Melde ihn bitte auf unserer GitHub-Issues-Seite!\n\n' +
                '**Bitte gib beim Melden an:**\n' +
                '• 📝 Genaue Beschreibung des Problems\n' +
                '• 📋 Schritte, um das Problem nachzustellen\n' +
                '• 📸 Screenshots, falls vorhanden\n' +
                '• 💻 Deine Bot-Version und Umgebung\n\n' +
                'So können wir Fehler schneller und gezielter beheben!',
            color: 'error'
        });
        bugReportEmbed.setFooter({
            text: 'Nexo Bug-Meldesystem',
            iconURL: client.user.displayAvatarURL()
        });
        bugReportEmbed.setTimestamp();

        await interaction.reply({
            embeds: [bugReportEmbed],
            components: [bugRow],
            flags: MessageFlags.Ephemeral
        });
    },
} satisfies ButtonHandler;

function getPaginationInfo(components: readonly TopLevelComponent[] | undefined): { currentPage: number; totalPages: number } {
    for (const row of components || []) {
        for (const component of ('components' in row && row.components) || []) {
            if ('customId' in component && component.customId === `${PAGINATION_PREFIX}_page`) {
                const label = ('label' in component && component.label) || '';
                const match = label.match(/(?:Page|Seite)\s+(\d+)\s+(?:of|von)\s+(\d+)/i);
                if (match) {
                    return {
                        currentPage: Number(match[1]),
                        totalPages: Number(match[2]),
                    };
                }
            }
        }
    }

    return { currentPage: 1, totalPages: 1 };
}

export const helpPaginationButton = {
    name: `${PAGINATION_PREFIX}_next`,
    async execute(interaction, client) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }

            const { currentPage, totalPages } = getPaginationInfo(interaction.message?.components);

            let nextPage = currentPage;
            switch (interaction.customId) {
                case `${PAGINATION_PREFIX}_first`:
                    nextPage = 1;
                    break;
                case `${PAGINATION_PREFIX}_prev`:
                    nextPage = Math.max(1, currentPage - 1);
                    break;
                case `${PAGINATION_PREFIX}_next`:
                    nextPage = Math.min(totalPages, currentPage + 1);
                    break;
                case `${PAGINATION_PREFIX}_last`:
                    nextPage = totalPages;
                    break;
                default:
                    nextPage = currentPage;
                    break;
            }

            const { embeds, components } = await createAllCommandsMenu(nextPage, client);
            await interaction.editReply({ embeds, components });
        } catch (error) {
            const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
            if (code === 40060 || code === 10062) {
                logger.warn('Help pagination interaction already acknowledged or expired.', {
                    event: 'interaction.help.pagination.unavailable',
                    errorCode: String(code),
                    customId: interaction.customId,
                    interactionId: interaction.id,
                });
                return;
            }

            throw error;
        }
    },
} satisfies ButtonHandler;