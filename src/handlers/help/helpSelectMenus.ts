import { createEmbed } from '../../utils/embeds.js';
import { isLoadableModuleFile } from '../../utils/helpers.js';
import { createButton, getPaginationRow } from '../../utils/components.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Collection, ActionRowBuilder, MessageFlags } from 'discord.js';
import type { ApplicationCommand, ButtonBuilder, EmbedBuilder } from 'discord.js';
import type { NexoClient, SelectMenuHandler } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { resolveLegacyName } from '../../config/commands/legacyCommandMap.js';
import { formatCategoryName, getCategoryIcon } from '../../config/commands/commandCategories.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACK_BUTTON_ID = "help-back-to-main";
const ALL_COMMANDS_ID = "help-all-commands";
const PAGINATION_PREFIX = "help-page";
const CATEGORY_SELECT_ID = "help-category-select";
const FOOTER_TEXT = "Mit ❤️ gemacht";
const SUBCOMMAND_TYPE = 1;
const SUBCOMMAND_GROUP_TYPE = 2;

interface HelpEntry {
    baseName: string;
    displayName: string;
    description: string;
    category: string;
}

interface HelpOptionData {
    type?: number;
    name?: string;
    description?: string;
    options?: (HelpOptionData | null | undefined)[];
}

interface HelpCommandData {
    name?: string;
    description?: string;
    options: (HelpOptionData | null | undefined)[];
}

interface HelpMenuPayload {
    embeds: EmbedBuilder[];
    components: ActionRowBuilder<ButtonBuilder>[];
}

function hasToJSON(value: unknown): value is { toJSON(): unknown } {
    return typeof value === 'object' && value !== null && 'toJSON' in value && typeof value.toJSON === 'function';
}


/** Appends the pre-consolidation name, e.g. "Zeigt deinen Kontostand (früher /balance)". */
function withLegacyHint(description: string, command: string, group: string | null, subcommand: string): string {
    const legacyName = resolveLegacyName(command, group, subcommand);
    if (!legacyName || legacyName === command) {
        return description;
    }
    return `${description} (früher /${group ? `${legacyName} ${subcommand}` : legacyName})`;
}

function buildHelpEntries(command: unknown, category: string): HelpEntry[] {
    const commandData = normalizeCommandData(command);
    if (!commandData?.name) {
        return [];
    }

    const baseName = commandData.name;
    const baseDescription = commandData.description || "Keine Beschreibung";
    const options = commandData.options || [];

    const entries: HelpEntry[] = [];

    for (const option of options) {
        if (!option) continue;

        if (option.type === SUBCOMMAND_TYPE) {
            entries.push({
                baseName,
                displayName: `${baseName} ${option.name}`,
                description: withLegacyHint(option.description || baseDescription, baseName, null, option.name ?? ""),
                category,
            });
            continue;
        }

        if (option.type === SUBCOMMAND_GROUP_TYPE) {
            const nestedOptions = option.options || [];
            for (const nested of nestedOptions) {
                if (nested?.type !== SUBCOMMAND_TYPE) continue;

                entries.push({
                    baseName,
                    displayName: `${baseName} ${option.name} ${nested.name}`,
                    description: withLegacyHint(nested.description || option.description || baseDescription, baseName, option.name ?? null, nested.name ?? ""),
                    category,
                });
            }
        }
    }

    if (entries.length === 0) {
        entries.push({
            baseName,
            displayName: baseName,
            description: baseDescription,
            category,
        });
    }

    return entries;
}

function normalizeCommandData(command: unknown): HelpCommandData | null {
    const rawData = typeof command === 'object' && command !== null && 'data' in command ? command.data : undefined;
    if (!rawData) {
        return null;
    }

    // Command data (builder JSON or a plain object) is loosely shaped; fields are checked below as in the JS.
    const jsonData = (hasToJSON(rawData) ? rawData.toJSON() : rawData) as { name?: string; description?: string; options?: unknown } | null;
    if (!jsonData?.name) {
        return null;
    }

    return {
        ...jsonData,
        options: Array.isArray(jsonData.options)
            ? jsonData.options.map((option: unknown) =>
                  hasToJSON(option) ? option.toJSON() : option,
              ) as (HelpOptionData | null | undefined)[]
            : [],
    };
}

async function createCategoryCommandsMenu(category: string, client: NexoClient): Promise<HelpMenuPayload> {
    const categoryName = formatCategoryName(category);
    const icon = getCategoryIcon(category);

    const categoryCommands: HelpEntry[] = [];

    try {
        const categoryPath = path.join(__dirname, "../../commands", category);
        const commandFiles = (await fs.readdir(categoryPath))
            .filter(isLoadableModuleFile)
            .sort();

        for (const file of commandFiles) {
            const filePath = path.join(categoryPath, file);
            const commandModule: { default?: unknown } = await import(`file://${filePath}`);
            const command = commandModule.default;
            const commandData = normalizeCommandData(command);

            if (commandData) {
                if (
                    commandData.name === "help" ||
                    commandData.name === "commandlist"
                )
                    continue;

                categoryCommands.push(...buildHelpEntries(command, categoryName));
            }
        }
    } catch (error) {
        logger.error(
            `Error reading commands from category ${category}:`,
            error,
        );
    }

    categoryCommands.sort((a, b) => a.displayName.localeCompare(b.displayName));

    let registeredCommands = new Collection<string, ApplicationCommand>();
    try {
        if (client?.application?.commands?.fetch) {
            const commands = await client.application.commands.fetch();
            for (const cmd of commands.values()) {
                registeredCommands.set(cmd.name, cmd);
            }
        }
    } catch (error) {
        logger.error('Error fetching registered commands:', error);
    }

    const embed = createEmbed({
        title: `${icon} ${categoryName}: Commands`,
        description: categoryCommands.length > 0
            ? `Klick auf einen Command, um ihn zu nutzen.`
            : `In der Kategorie **${categoryName}** wurden keine Commands gefunden.`
    });

    if (categoryCommands.length > 0) {
        const commandMentions = categoryCommands
            .map((cmd) => {
                const registeredCmd = registeredCommands.get(cmd.baseName);
                if (registeredCmd && registeredCmd.id) {
                    return `</${cmd.displayName}:${registeredCmd.id}> · ${cmd.description}`;
                }
                return `\`/${cmd.displayName}\` · ${cmd.description}`;
            })
            .join("\n");

        const maxLength = 1000;
        if (commandMentions.length <= maxLength) {
            embed.addFields({
                name: "Commands",
                value: commandMentions,
                inline: false,
            });
        } else {
            const chunks: string[] = [];
            let currentChunk = "";
            const lines = commandMentions.split("\n");

            for (const line of lines) {
                if ((currentChunk + "\n" + line).length > maxLength) {
                    if (currentChunk) chunks.push(currentChunk);
                    currentChunk = line;
                } else {
                    currentChunk += (currentChunk ? "\n" : "") + line;
                }
            }
            if (currentChunk) chunks.push(currentChunk);

            chunks.forEach((chunk, index) => {
                embed.addFields({
                    name: `Commands (Teil ${index + 1})`,
                    value: chunk,
                    inline: false,
                });
            });
        }
    }

    embed.setFooter({ text: FOOTER_TEXT });
    embed.setTimestamp();

    const backButton = createButton(
        BACK_BUTTON_ID,
        "Zurück",
        "primary",
        "⬅️",
        false,
    );

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(backButton);

    return {
        embeds: [embed],
        components: [buttonRow],
    };
}

export async function createAllCommandsMenu(
    page = 1,
    client: NexoClient,
): Promise<HelpMenuPayload & { currentPage: number; totalPages: number }> {
    const commandsPerPage = 45;
    const allCommands: HelpEntry[] = [];

    const commandsPath = path.join(__dirname, "../../commands");
    const categoryDirs = (
        await fs.readdir(commandsPath, { withFileTypes: true })
    )
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .sort();

    for (const category of categoryDirs) {
        try {
            const categoryPath = path.join(
                __dirname,
                "../../commands",
                category,
            );
            const commandFiles = (await fs.readdir(categoryPath))
                .filter(isLoadableModuleFile)
                .sort();

            for (const file of commandFiles) {
                const filePath = path.join(categoryPath, file);
                const commandModule: { default?: unknown } = await import(`file://${filePath}`);
                const command = commandModule.default;
                const commandData = normalizeCommandData(command);

                if (commandData) {
                    if (
                        commandData.name === "help" ||
                        commandData.name === "commandlist"
                    )
                        continue;

                    const categoryName = formatCategoryName(category);

                    allCommands.push(...buildHelpEntries(command, categoryName));
                }
            }
        } catch (error) {
            logger.error(
                `Error reading commands from category ${category}:`,
                error,
            );
        }
    }

    allCommands.sort((a, b) => a.displayName.localeCompare(b.displayName));

    let registeredCommands = new Collection<string, ApplicationCommand>();
    try {
        if (client?.application?.commands?.fetch) {
            const commands = await client.application.commands.fetch();
            for (const cmd of commands.values()) {
                registeredCommands.set(cmd.name, cmd);
            }
        }
    } catch (error) {
        logger.error('Error fetching registered commands:', error);
    }

    const totalPages = Math.ceil(allCommands.length / commandsPerPage);
    const startIndex = (page - 1) * commandsPerPage;
    const endIndex = startIndex + commandsPerPage;
    const pageCommands = allCommands.slice(startIndex, endIndex);

    const embed = createEmbed({
        title: "📋 Alle Commands",
        description: `Alle verfügbaren Commands in einer Liste. Mit den Buttons unten blätterst du durch die Seiten.`
    });

    embed.setFooter({ text: FOOTER_TEXT });
    embed.setTimestamp();

    if (pageCommands.length > 0) {
        const commandMentions = pageCommands.map((cmd) => {
            const registeredCmd = registeredCommands.get(cmd.baseName);
            if (registeredCmd && registeredCmd.id) {
                return `</${cmd.displayName}:${registeredCmd.id}> · ${cmd.category}`;
            }
            return `\`/${cmd.displayName}\` · ${cmd.category}`;
        });

        const columnCount = pageCommands.length > 20 ? 3 : (pageCommands.length > 10 ? 2 : 1);
        const chunkSize = Math.ceil(commandMentions.length / columnCount);

        for (let i = 0; i < columnCount; i++) {
            const chunk = commandMentions
                .slice(i * chunkSize, (i + 1) * chunkSize)
                .join("\n");

            if (!chunk) continue;

            embed.addFields({
                name: i === 0 ? `Commands (Seite ${page})` : "Commands (Forts.)",
                value: chunk,
                inline: columnCount > 1,
            });
        }
    }

    const components: ActionRowBuilder<ButtonBuilder>[] = [];

    if (totalPages > 1) {
        const paginationRow = getPaginationRow(
            PAGINATION_PREFIX,
            page,
            totalPages,
        );
        components.push(paginationRow);
    }

    const backButton = createButton(
        BACK_BUTTON_ID,
        "Zurück",
        "primary",
        "⬅️",
        false,
    );

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(backButton);
    components.push(buttonRow);

    return {
        embeds: [embed],
        components,
        currentPage: page,
        totalPages,
    };
}

export const helpCategorySelectMenu = {
    name: CATEGORY_SELECT_ID,
    async execute(interaction, client) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }

            const selectedCategory = interaction.values[0];

            if (selectedCategory === ALL_COMMANDS_ID) {
                const { embeds, components } = await createAllCommandsMenu(1, client);
                await interaction.editReply({
                    embeds,
                    components,
                });
            } else {
                const { embeds, components } = await createCategoryCommandsMenu(selectedCategory, client);
                await interaction.editReply({
                    embeds,
                    components,
                });
            }
        } catch (error) {
            const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
            if (code === 40060 || code === 10062) {
                logger.warn('Help category select interaction already acknowledged or expired.', {
                    event: 'interaction.help.select.unavailable',
                    errorCode: String(code),
                    customId: interaction.customId,
                    interactionId: interaction.id,
                });
                return;
            }

            await handleInteractionError(interaction, error, {
                type: 'select_menu',
                customId: interaction.customId,
                handler: 'help_category',
            });
        }
    },
} satisfies SelectMenuHandler;