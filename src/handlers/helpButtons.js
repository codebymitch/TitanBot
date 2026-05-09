import { MessageFlags } from 'discord.js';
import { createAllCommandsMenu } from './helpSelectMenus.js';
import { createInitialHelpMenu } from '../commands/Core/help.js';
import { createEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';

const COMMAND_LIST_ID = "help-command-list";
const BACK_BUTTON_ID = "help-back-to-main";
const PAGINATION_PREFIX = "help-page";

export const helpBackButton = {
    name: BACK_BUTTON_ID,
    async execute(interaction, client) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }

            const { embeds, components } = await createInitialHelpMenu(client, interaction.member);
            await interaction.editReply({
                embeds,
                components,
            });
        } catch (error) {
            if (error?.code === 40060 || error?.code === 10062) {
                logger.warn('Help back button interaction already acknowledged or expired.', {
                    event: 'interaction.help.button.unavailable',
                    errorCode: String(error.code),
                    customId: interaction.customId,
                    interactionId: interaction.id,
                });
                return;
            }

            throw error;
        }
    },
};


export const helpCmdButton = {
    name: 'help-cmd',
    async execute(interaction, client, args) {
        const displayName = args[0];
        if (!displayName) return;

        const [baseName, ...subParts] = displayName.split(' ');
        const command = client.commands.get(baseName);

        let description = 'No description available.';

        if (command) {
            const rawData = command.data;
            const jsonData = typeof rawData?.toJSON === 'function' ? rawData.toJSON() : rawData;
            description = jsonData?.description || description;

            let options = (jsonData?.options || []).map(o =>
                typeof o?.toJSON === 'function' ? o.toJSON() : o
            );
            for (const part of subParts) {
                const opt = options.find(o => o.name === part);
                if (opt) {
                    description = opt.description || description;
                    options = (opt.options || []).map(o =>
                        typeof o?.toJSON === 'function' ? o.toJSON() : o
                    );
                }
            }
        }

        const embed = createEmbed({
            title: `/${displayName}`,
            description,
            color: 'secondary',
        });

        await interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral,
        });
    }
};

function getPaginationInfo(components) {
    for (const row of components || []) {
        for (const component of row.components || []) {
            if (component.customId === `${PAGINATION_PREFIX}_page`) {
                const label = component.label || '';
                const match = label.match(/Page\s+(\d+)\s+of\s+(\d+)/i);
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

            const { embeds, components } = await createAllCommandsMenu(nextPage, client, interaction.member);
            await interaction.editReply({ embeds, components });
        } catch (error) {
            if (error?.code === 40060 || error?.code === 10062) {
                logger.warn('Help pagination interaction already acknowledged or expired.', {
                    event: 'interaction.help.pagination.unavailable',
                    errorCode: String(error.code),
                    customId: interaction.customId,
                    interactionId: interaction.id,
                });
                return;
            }

            throw error;
        }
    },
};


