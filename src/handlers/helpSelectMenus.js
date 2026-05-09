import { createEmbed } from '../utils/embeds.js';
import { createButton, getPaginationRow } from '../utils/components.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Collection, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACK_BUTTON_ID = "help-back-to-main";
const ALL_COMMANDS_ID = "help-all-commands";
const PAGINATION_PREFIX = "help-page";
const CATEGORY_SELECT_ID = "help-category-select";
const FOOTER_TEXT = "Made with ❤️";
const SUBCOMMAND_TYPE = 1;
const SUBCOMMAND_GROUP_TYPE = 2;

const CATEGORY_ICONS = {
    Core: "ℹ️",
    Moderation: "🛡️",
    Economy: "💰",
    Fun: "🎮",
    Leveling: "📊",
    Utility: "🔧",
    Ticket: "🎫",
    Welcome: "👋",
    Giveaway: "🎉",
    Counter: "🔢",
    Tools: "🛠️",
    Search: "🔍",
    Reaction_roles: "🎭",
    Community: "👥",
    Birthday: "🎂",
    Config: "⚙️",
    Jointocreate: "🎙️",
    Serverstats: "📈",
    Logging: "📋",
    Voice: "🔊",
    Verification: "✅",
};

// Returns true if the member has permission to use the command
export function canMemberUseCommand(member, commandData) {
    if (!member) return true;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

    const defaultPerms = commandData?.default_member_permissions;
    if (defaultPerms == null) return true;

    try {
        const required = BigInt(defaultPerms);
        if (required === 0n) return false;
        return member.permissions.has(required);
    } catch {
        return true;
    }
}

// Returns a Set of category directory names the member has at least one accessible command in
export function getAccessibleCategories(client, member) {
    if (!member) return null;
    const accessible = new Set();
    for (const command of client.commands.values()) {
        if (!command.category) continue;
        const cmdData = typeof command.data?.toJSON === 'function'
            ? command.data.toJSON()
            : command.data;
        if (canMemberUseCommand(member, cmdData)) {
            accessible.add(command.category);
        }
    }
    return accessible;
}

function buildHelpEntries(command, category) {
    const commandData = normalizeCommandData(command);
    if (!commandData?.name) {
        return [];
    }

    const baseName = commandData.name;
    const baseDescription = commandData.description || "No description";
    const options = commandData.options || [];

    const entries = [];

    for (const option of options) {
        if (!option) continue;

        if (option.type === SUBCOMMAND_TYPE) {
            entries.push({
                baseName,
                displayName: `${baseName} ${option.name}`,
                description: option.description || baseDescription,
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
                    description: nested.description || option.description || baseDescription,
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

function normalizeCommandData(command) {
    const rawData = command?.data;
    if (!rawData) {
        return null;
    }

    const jsonData = typeof rawData.toJSON === 'function' ? rawData.toJSON() : rawData;
    if (!jsonData?.name) {
        return null;
    }

    return {
        ...jsonData,
        options: Array.isArray(jsonData.options)
            ? jsonData.options.map((option) =>
                  typeof option?.toJSON === 'function' ? option.toJSON() : option,
              )
            : [],
    };
}

async function createCategoryCommandsMenu(category, client, member) {
    const categoryName =
        category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
    const icon = CATEGORY_ICONS[categoryName] || "🔍";

    const categoryCommands = [];

    try {
        const categoryPath = path.join(__dirname, "../commands", category);
        const commandFiles = (await fs.readdir(categoryPath))
            .filter((file) => file.endsWith(".js"))
            .sort();

        for (const file of commandFiles) {
            const filePath = path.join(categoryPath, file);
            const commandModule = await import(`file://${filePath}`);
            const command = commandModule.default;
            const commandData = normalizeCommandData(command);

            if (commandData) {
                if (
                    commandData.name === "help" ||
                    commandData.name === "commandlist"
                )
                    continue;

                // Only show commands the member can use
                if (!canMemberUseCommand(member, commandData)) continue;

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

    let registeredCommands = new Collection();
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

    const MAX_CMD_BUTTONS = 20; // 4 rows × 5
    const displayedEntries = categoryCommands.slice(0, MAX_CMD_BUTTONS);
    const hiddenCount = categoryCommands.length - displayedEntries.length;

    const embed = createEmbed({
        title: `${icon} ${categoryName} Commands`,
        description: categoryCommands.length > 0
            ? `**${categoryCommands.length}** command${categoryCommands.length !== 1 ? 's' : ''} available${hiddenCount > 0 ? ` · showing first ${MAX_CMD_BUTTONS}` : ''}. Click any command for details.`
            : `You don't have permission to use any commands in the **${categoryName}** category.`
    });

    embed.setFooter({ text: FOOTER_TEXT });
    embed.setTimestamp();

    const cmdButtonRows = [];
    for (let i = 0; i < displayedEntries.length; i += 5) {
        const chunk = displayedEntries.slice(i, i + 5);
        const row = new ActionRowBuilder().addComponents(
            chunk.map(entry =>
                new ButtonBuilder()
                    .setCustomId(`help-cmd:${entry.displayName}`)
                    .setLabel(`/${entry.displayName}`.substring(0, 80))
                    .setStyle(ButtonStyle.Secondary)
            )
        );
        cmdButtonRows.push(row);
    }

    const backButton = createButton(BACK_BUTTON_ID, "Back", "primary", "⬅️", false);
    const navRow = new ActionRowBuilder().addComponents(backButton);

    return {
        embeds: [embed],
        components: [...cmdButtonRows, navRow],
    };
}

export async function createAllCommandsMenu(page = 1, client, member) {
    const commandsPerPage = 45;
    const allCommands = [];

    const commandsPath = path.join(__dirname, "../commands");
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
                "../commands",
                category,
            );
            const commandFiles = (await fs.readdir(categoryPath))
                .filter((file) => file.endsWith(".js"))
                .sort();

            for (const file of commandFiles) {
                const filePath = path.join(categoryPath, file);
                const commandModule = await import(`file://${filePath}`);
                const command = commandModule.default;
                const commandData = normalizeCommandData(command);

                if (commandData) {
                    if (
                        commandData.name === "help" ||
                        commandData.name === "commandlist"
                    )
                        continue;

                    // Only show commands the member can use
                    if (!canMemberUseCommand(member, commandData)) continue;

                    const categoryName =
                        category.charAt(0).toUpperCase() +
                        category.slice(1).toLowerCase();

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

    let registeredCommands = new Collection();
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
        title: "📋 All Commands",
        description: `${allCommands.length} commands available to you`
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
                name: i === 0 ? `Commands (Page ${page})` : "Commands (cont.)",
                value: chunk,
                inline: columnCount > 1,
            });
        }
    }

    const components = [];

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
        "Back",
        "primary",
        "⬅️",
        false,
    );

    const buttonRow = new ActionRowBuilder().addComponents(backButton);
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

            const member = interaction.member;
            const selectedCategory = interaction.values[0];

            if (selectedCategory === ALL_COMMANDS_ID) {
                const { embeds, components } = await createAllCommandsMenu(1, client, member);
                await interaction.editReply({
                    embeds,
                    components,
                });
            } else {
                const { embeds, components } = await createCategoryCommandsMenu(selectedCategory, client, member);
                await interaction.editReply({
                    embeds,
                    components,
                });
            }
        } catch (error) {
            if (error?.code === 40060 || error?.code === 10062) {
                logger.warn('Help category select interaction already acknowledged or expired.', {
                    event: 'interaction.help.select.unavailable',
                    errorCode: String(error.code),
                    customId: interaction.customId,
                    interactionId: interaction.id,
                });
                return;
            }

            logger.error('Error in help category select menu handler:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while loading help categories.',
                    flags: MessageFlags.Ephemeral,
                });
            }
        }
    },
};
