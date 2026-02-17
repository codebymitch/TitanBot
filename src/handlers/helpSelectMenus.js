import { createEmbed } from '../utils/embeds.js';
import { createButton, getPaginationRow } from '../utils/components.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Collection, ActionRowBuilder } from 'discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACK_BUTTON_ID = "help-back-to-main";
const ALL_COMMANDS_ID = "help-all-commands";
const PAGINATION_PREFIX = "help-page";
const CATEGORY_SELECT_ID = "help-category-select";

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
    Reaction_Roles: "🎭",
    Community: "👥",
    Birthday: "🎂",
    Config: "⚙️",
};

async function createCategoryCommandsMenu(category, client) {
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

            if (command && command.data && command.data.name) {
                if (
                    command.data.name === "help" ||
                    command.data.name === "commandlist"
                )
                    continue;

                categoryCommands.push({
                    name: command.data.name,
                    description: command.data.description || "No description",
                    options: command.data.options || [],
                });
            }
        }
    } catch (error) {
        console.error(
            `Error reading commands from category ${category}:`,
            error,
        );
    }

    categoryCommands.sort((a, b) => a.name.localeCompare(b.name));

    let registeredCommands = new Collection();
    try {
        if (client && client.application) {
            const commands = await client.application.commands.fetch();
            for (const cmd of commands.values()) {
                registeredCommands.set(cmd.name, cmd);
            }
        }
    } catch (error) {
        console.error("Error fetching registered commands:", error);
    }

    const embed = createEmbed({
        title: `${icon} ${categoryName} Commands`,
        description: categoryCommands.length > 0
            ? `Click any command mention below to use it:`
            : `No commands found in the **${categoryName}** category.`
    });

    if (categoryCommands.length > 0) {
        const commandMentions = categoryCommands
            .map((cmd) => {
                const registeredCmd = registeredCommands.get(cmd.name);
                if (registeredCmd && registeredCmd.id) {
                    return `</${cmd.name}:${registeredCmd.id}> · ${cmd.description}`;
                }
                return `\`/${cmd.name}\` · ${cmd.description}`;
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
            const chunks = [];
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
                    name: `Commands (Part ${index + 1})`,
                    value: chunk,
                    inline: false,
                });
            });
        }
    }

    const backButton = createButton(
        BACK_BUTTON_ID,
        "Back",
        "primary",
        "⬅️",
        false,
    );

    const buttonRow = new ActionRowBuilder().addComponents(backButton);

    return {
        embeds: [embed],
        components: [buttonRow],
    };
}

export async function createAllCommandsMenu(page = 1, client) {
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

                if (command && command.data && command.data.name) {
                    if (
                        command.data.name === "help" ||
                        command.data.name === "commandlist"
                    )
                        continue;

                    allCommands.push({
                        name: command.data.name,
                        description:
                            command.data.description || "No description",
                        category:
                            category.charAt(0).toUpperCase() +
                            category.slice(1).toLowerCase(),
                    });
                }
            }
        } catch (error) {
            console.error(
                `Error reading commands from category ${category}:`,
                error,
            );
        }
    }

    allCommands.sort((a, b) => a.name.localeCompare(b.name));

    let registeredCommands = new Collection();
    try {
        if (client && client.application) {
            const commands = await client.application.commands.fetch();
            for (const cmd of commands.values()) {
                registeredCommands.set(cmd.name, cmd);
            }
        }
    } catch (error) {
        console.error("Error fetching registered commands:", error);
    }

    const totalPages = Math.ceil(allCommands.length / commandsPerPage);
    const startIndex = (page - 1) * commandsPerPage;
    const endIndex = startIndex + commandsPerPage;
    const pageCommands = allCommands.slice(startIndex, endIndex);

    const embed = createEmbed({
        title: "📋 All Commands",
        description: `(${allCommands.length}+ total commands)`
    });

    if (pageCommands.length > 0) {
        const commandMentions = pageCommands.map((cmd) => {
            const registeredCmd = registeredCommands.get(cmd.name);
            if (registeredCmd && registeredCmd.id) {
                return `</${cmd.name}:${registeredCmd.id}> · ${cmd.category}`;
            }
            return `\`/${cmd.name}\` · ${cmd.category}`;
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
        const selectedCategory = interaction.values[0];

        if (selectedCategory === ALL_COMMANDS_ID) {
            const { embeds, components } = await createAllCommandsMenu(1, client);
            await interaction.update({
                embeds,
                components,
            });
        } else {
            const { embeds, components } = await createCategoryCommandsMenu(selectedCategory, client);
            await interaction.update({
                embeds,
                components,
            });
        }
    },
};




