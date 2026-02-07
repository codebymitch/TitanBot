import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Collection,
    StringSelectMenuBuilder,
} from "discord.js";
import { createEmbed } from "../../utils/embeds.js";
import {
    getPromoRow,
    createButton,
    createSelectMenu,
    getPaginationRow,
} from "../../utils/components.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COMMAND_LIST_ID = "help-command-list";
const BACK_BUTTON_ID = "help-back-to-main";
const CATEGORY_SELECT_ID = "help-category-select";
const ALL_COMMANDS_ID = "help-all-commands";
const PAGINATION_PREFIX = "help-page";

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

/**
 * Creates the initial help menu embed and components
 * @returns {Object} Object containing embeds and components
 */
function createInitialHelpMenu() {
    const embed = createEmbed({ 
        title: "🤖 TitanBot Help Center",
        description: "Welcome to TitanBot! Your all-in-one Discord companion for moderation, fun, and server management.",
        color: 0x0099FF
    });

    embed.addFields({
        name: "✨ **Bot Features**",
        value: "🛡️ **Moderation** • 💰 **Economy** • 🎮 **Fun Games**\n📊 **Leveling System** • 🎫 **Tickets** • 🎉 **Giveaways**\n👋 **Welcome System** • 🎂 **Birthdays** • 🔧 **Utilities**",
        inline: false
    });

    embed.addFields({
        name: "📊 **Quick Stats**",
        value: "⚡ **Commands Available:** 50+ Slash Commands\n🌟 **Categories:** 12 Command Categories\n🔧 **Fully Configurable:** Customizable per server",
        inline: false
    });

    embed.addFields({
        name: "🚀 **How to Use**",
        value: "• Click **📋 Command List** below to browse all commands\n• Use `/commandlist` for a quick overview\n• All commands are slash commands (start with `/`)\n• Hover over commands to see their options",
        inline: false
    });

    embed.setFooter({ 
        text: "TitanBot • Made with ❤️ for Discord communities" 
    });
    embed.setTimestamp();

    const commandListButton = createButton(
        COMMAND_LIST_ID,
        "Command List",
        "primary",
        "📋",
        false,
    );

    const promoRow = getPromoRow();

    const buttonRow = new ActionRowBuilder().addComponents([
        commandListButton,
        ...promoRow.components,
    ]);

    return {
        embeds: [embed],
        components: [buttonRow],
        ephemeral: false,
    };
}

/**
 * Creates the category selection menu with dropdown
 * @returns {Object} Object containing embeds and components
 */
async function createCategorySelectMenu() {
    const commandsPath = path.join(__dirname, "../../commands");
    const categoryDirs = (
        await fs.readdir(commandsPath, { withFileTypes: true })
    )
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .sort();

    const options = [
        {
            label: "📋 All Commands",
            description: "View all available commands with pagination",
            value: ALL_COMMANDS_ID,
        },
        ...categoryDirs.map((category) => {
            const categoryName =
                category.charAt(0).toUpperCase() +
                category.slice(1).toLowerCase();
            const icon = CATEGORY_ICONS[categoryName] || "📁";
            return {
                label: `${icon} ${categoryName}`,
                description: `View commands in the ${categoryName} category`,
                value: category,
            };
        }),
    ];

    const embed = createEmbed({ 
        title: "🤖 TitanBot Help Center",
        description: "Welcome to TitanBot! Your all-in-one Discord companion for moderation, fun, and server management.\n\nSelect a category below to explore our powerful commands:",
        color: 0x0099FF
    });

    embed.addFields({
        name: "✨ **Bot Features**",
        value: "🛡️ **Moderation** • 💰 **Economy** • 🎮 **Fun Games**\n📊 **Leveling System** • 🎫 **Tickets** • 🎉 **Giveaways**\n👋 **Welcome System** • 🎂 **Birthdays** • 🔧 **Utilities**",
        inline: false
    });

    embed.addFields({
        name: "📊 **Quick Stats**",
        value: "⚡ **Commands Available:** 50+ Slash Commands\n🌟 **Categories:** 12 Command Categories\n🔧 **Fully Configurable:** Customizable per server",
        inline: false
    });

    embed.setFooter({ 
        text: "TitanBot • Made with ❤️ for Discord communities" 
    });
    embed.setTimestamp();

    const supportButton = new ButtonBuilder()
        .setLabel("Support Server")
        .setURL("https://discord.gg/QnWNz2dKCE")
        .setStyle(ButtonStyle.Link);

    const touchpointButton = new ButtonBuilder()
        .setLabel("Learn from Touchpoint")
        .setURL("https://www.youtube.com/@TouchDisc")
        .setStyle(ButtonStyle.Link);

    const selectRow = createSelectMenu(
        CATEGORY_SELECT_ID,
        "Select to view the commands",
        options,
    );

    const buttonRow = new ActionRowBuilder().addComponents([
        supportButton,
        touchpointButton,
    ]);

    return {
        embeds: [embed],
        components: [buttonRow, selectRow],
        ephemeral: false,
    };
}

/**
 * Creates the command list for a specific category
 * @param {string} category The category to show commands for
 * @param {Collection} commands Collection of registered commands
 * @param {Client} client Discord.js client
 * @returns {Object} Object containing embeds and components
 */
async function createCategoryCommandsMenu(category, commands, client) {
    const categoryName =
        category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
    const icon = CATEGORY_ICONS[categoryName] || "📁";

    const categoryCommands = [];

    try {
        const categoryPath = path.join(__dirname, "../../commands", category);
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
        } else {
            console.warn("Client or client.application is not available, using fallback command format");
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
                    return `</${cmd.name}:${registeredCmd.id}> - ${cmd.description}`;
                } else {
                    return `**/${cmd.name}** - ${cmd.description}`;
                }
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
        ephemeral: false,
    };
}

/**
 * Creates the all commands menu with pagination
 * @param {number} page The page number to display
 * @param {Client} client Discord.js client
 * @returns {Object} Object containing embeds, components, and pagination info
 */
async function createAllCommandsMenu(page = 1, client) {
const commandsPerPage = 20;
    const allCommands = [];

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
        } else {
            console.warn("Client or client.application is not available, using fallback command format");
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
        description: `Page ${page} of ${totalPages} (${allCommands.length} total commands)`
    });

    if (pageCommands.length > 0) {
        const commandMentions = pageCommands
            .map((cmd) => {
                const registeredCmd = registeredCommands.get(cmd.name);
                if (registeredCmd && registeredCmd.id) {
                    return `</${cmd.name}:${registeredCmd.id}> - **${cmd.category}**`;
                } else {
                    return `**/${cmd.name}** - **${cmd.category}**`;
                }
            })
            .join("\n");

        embed.addFields({
            name: `Commands (Page ${page})`,
            value: commandMentions,
            inline: false,
        });
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
        ephemeral: false,
        currentPage: page,
        totalPages,
    };
}

export default {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Displays the help menu with all available commands"),

    async execute(interaction, client) {
        const { embeds, components, ephemeral } =
            await createCategorySelectMenu();

        const reply = await interaction.reply({
            embeds,
            components,
        });

const timerDuration = 120000;
        let currentPageState = { page: 1, totalPages: 1 };

        console.log(`[Help Command] Setting up timer for ${timerDuration}ms`);

        const timeoutId = setTimeout(async () => {
            console.log(`[Help Command] Timer triggered - closing help menu`);
            
            const closedEmbed = createEmbed({ 
                title: "⏰ Help Menu Closed", 
                description: "Help menu has been closed, use /help again."
            });

            try {
                console.log(`[Help Command] Attempting to edit message...`);
                await reply.edit({
                    embeds: [closedEmbed],
                    components: [],
                });
                console.log(`[Help Command] Message edited successfully`);
            } catch (error) {
                console.error(`[Help Command] Error editing message:`, error);
                
                try {
                    console.log(`[Help Command] Trying fallback with interaction.editReply...`);
                    await interaction.editReply({
                        embeds: [closedEmbed],
                        components: [],
                    });
                    console.log(`[Help Command] Fallback editReply successful`);
                } catch (fallbackError) {
                    console.error(`[Help Command] Fallback also failed:`, fallbackError);
                    
                    try {
                        console.log(`[Help Command] Trying last resort with followUp...`);
                        await interaction.followUp({
                            embeds: [closedEmbed],
                            flags: ["Ephemeral"],
                        });
                        console.log(`[Help Command] FollowUp successful`);
                    } catch (followUpError) {
                        console.error(`[Help Command] All methods failed:`, followUpError);
                    }
                }
            }
        }, timerDuration);

        const filter = (i) => i.user.id === interaction.user.id;
        const collector = reply.createMessageComponentCollector({
            filter,
time: timerDuration + 10000,
        });

        collector.on("collect", async (i) => {
            try {
                if (i.customId === CATEGORY_SELECT_ID) {
                    const selectedCategory = i.values[0];

                    if (selectedCategory === ALL_COMMANDS_ID) {
                        const result = await createAllCommandsMenu(1, client);
                        currentPageState = {
                            page: result.currentPage,
                            totalPages: result.totalPages,
                        };
                        await i.update({
                            embeds: result.embeds,
                            components: result.components,
                        });
                    } else {
                        const { embeds, components } =
                            await createCategoryCommandsMenu(
                                selectedCategory,
                                client.commands,
                                client,
                            );
                        await i.update({ embeds, components });
                    }
                } else if (i.customId === BACK_BUTTON_ID) {
                    const { embeds, components } =
                        await createCategorySelectMenu();
                    await i.update({ embeds, components });
                } else if (i.customId.startsWith(`${PAGINATION_PREFIX}_`)) {
                    const action = i.customId.split("_").pop();

                    let newPage = currentPageState.page;

                    switch (action) {
                        case "first":
                            newPage = 1;
                            break;
                        case "prev":
                            newPage = Math.max(1, currentPageState.page - 1);
                            break;
                        case "next":
                            newPage = Math.min(
                                currentPageState.totalPages,
                                currentPageState.page + 1,
                            );
                            break;
                        case "last":
                            newPage = currentPageState.totalPages;
                            break;
                    }

                    if (newPage !== currentPageState.page) {
                        const result = await createAllCommandsMenu(
                            newPage,
                            client,
                        );
                        currentPageState = {
                            page: result.currentPage,
                            totalPages: result.totalPages,
                        };
                        await i.update({
                            embeds: result.embeds,
                            components: result.components,
                        });
                    } else {
                        await i.deferUpdate();
                    }
                }
            } catch (error) {
                console.error("Error in help command interaction:", error);

                if (!i.replied && !i.deferred) {
                    await i
                        .reply({
                            embeds: [
                                createEmbed({ 
                                    title: "❌ Error", 
                                    description: "An error occurred while processing your request."
                                }),
                            ],
                            flags: ["Ephemeral"],
                        })
                        .catch(console.error);
                } else {
                    await i
                        .followUp({
                            embeds: [
                                createEmbed({ 
                                    title: "❌ Error", 
                                    description: "An error occurred while processing your request."
                                }),
                            ],
                            flags: ["Ephemeral"],
                        })
                        .catch(console.error);
                }
            }
        });

        collector.on("end", () => {
            console.log(`[Help Command] Collector ended`);
            if (!reply.editable) return;

            const disabledComponents = reply.components.map((row) => {
                if (row.components[0].type === "STRING_SELECT") {
                    return ActionRowBuilder.from(row).setComponents(
                        StringSelectMenuBuilder.from(
                            row.components[0],
                        ).setDisabled(true),
                    );
                } else {
                    return ActionRowBuilder.from(row).setComponents(
                        row.components.map((component) =>
                            ButtonBuilder.from(component).setDisabled(true),
                        ),
                    );
                }
            });

            reply.edit({ components: disabledComponents }).catch(console.error);
        });
    },
};
