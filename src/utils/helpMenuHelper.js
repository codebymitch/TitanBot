import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { createEmbed } from "./embeds.js";
import { createSelectMenu } from "./components.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATEGORY_SELECT_ID = "help-category-select";
const ALL_COMMANDS_ID = "help-all-commands";

const CATEGORY_ICONS = {
    Core: "ℹ️", Moderation: "🛡️", Fun: "🎮", Leveling: "📊", Utility: "🔧",
    Ticket: "🎫", Welcome: "👋", Giveaway: "🎉", Counter: "🔢", Tools: "🛠️",
    Search: "🔍", Reaction_Roles: "🎭", Community: "👥", Birthday: "🎂", Config: "⚙️",
};

/**
 * Tạo menu help ban đầu
 * @param {Client} client - Discord bot client
 * @returns {Promise<{embeds: Array, components: Array}>}
 */
export async function createInitialHelpMenu(client) {
    const commandsPath = path.join(__dirname, "../commands");
    const categoryDirs = (await fs.readdir(commandsPath, { withFileTypes: true }))
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .sort();

    const options = [
        { label: "📋 All Commands", description: "View all available commands", value: ALL_COMMANDS_ID },
        ...categoryDirs.map((category) => {
            const categoryName = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
            const icon = CATEGORY_ICONS[categoryName] || "🔍";
            return { label: `${icon} ${categoryName}`, description: `View commands in ${categoryName}`, value: category };
        }),
    ];

    const botName = client?.user?.username || "Starlight Security";
    const embed = createEmbed({
        title: `🤖 ${botName} Help Center`,
        description: "Welcome! Here is the list of available modules.",
        color: 'primary'
    });

    embed.addFields(
        { name: "🛡️ Moderation", value: "Tools for server protection", inline: true },
        { name: "🎮 Fun", value: "Entertainment commands", inline: true },
        { name: "📊 Leveling", value: "XP and progression", inline: true },
        { name: "🎫 Tickets", value: "Support ticket system", inline: true },
        { name: "🎉 Giveaways", value: "Automated giveaways", inline: true },
        { name: "✅ Verification", value: "Access gating", inline: true }
    );
    embed.setFooter({ text: "Starlight Security | Secured by Dev" });
    embed.setTimestamp();

    const bugReportButton = new ButtonBuilder()
        .setLabel("Contact Developer")
        .setStyle(ButtonStyle.Link)
        .setURL("https://discord.com/users/1198136184526864475");

    const selectRow = createSelectMenu(CATEGORY_SELECT_ID, "Select a category", options);
    const buttonRow = new ActionRowBuilder().addComponents([bugReportButton]);

    return { embeds: [embed], components: [buttonRow, selectRow] };
}

/**
 * Lấy danh sách tất cả categories
 * @returns {Promise<Array>}
 */
export async function getAllCategories() {
    const commandsPath = path.join(__dirname, "../commands");
    const categoryDirs = (await fs.readdir(commandsPath, { withFileTypes: true }))
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .sort();
    return categoryDirs;
}

/**
 * Lấy description của command từ file
 * @param {string} filePath - Path đến file command
 * @returns {Promise<string>}
 */
async function getCommandDescription(filePath) {
    try {
        const commandModule = await import(`file://${filePath}`);
        const command = commandModule.default;
        
        if (command?.data?.description) {
            return command.data.description;
        }
    } catch (error) {
        console.error(`Error loading command description from ${filePath}:`, error);
    }
    return "No description available";
}

/**
 * Tạo embed cho một category cụ thể với pagination
 * @param {string} category - Category name
 * @param {number} page - Page number
 * @param {Client} client - Discord bot client
 * @returns {Promise<{embed: EmbedBuilder, totalPages: number, currentPage: number}>}
 */
export async function getCategoryEmbedAndPageCount(category, page = 1, client) {
    const commandsPath = path.join(__dirname, "../commands");
    const categoryPath = path.join(commandsPath, category);
    
    try {
        const files = (await fs.readdir(categoryPath))
            .filter(file => file.endsWith('.js'))
            .sort();

        const categoryName = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
        const icon = CATEGORY_ICONS[categoryName] || "🔍";
        const pageSize = 5;
        const totalPages = Math.ceil(files.length / pageSize) || 1;
        
        // Validate page number - FIX: ensure page is within valid range
        const validPage = Math.max(1, Math.min(page, totalPages));
        
        const startIndex = (validPage - 1) * pageSize;
        const paginatedFiles = files.slice(startIndex, startIndex + pageSize);

        const embed = createEmbed({
            title: `${icon} ${categoryName} Commands`,
            description: `Page ${validPage} of ${totalPages}`,
            color: 'primary'
        });

        // Load descriptions for each command
        for (const file of paginatedFiles) {
            const commandName = file.replace('.js', '');
            const filePath = path.join(categoryPath, file);
            const description = await getCommandDescription(filePath);
            
            embed.addFields({
                name: `• ${commandName}`,
                value: description,
                inline: false
            });
        }

        embed.setFooter({ text: `Starlight Security | Page ${validPage}/${totalPages}` });
        embed.setTimestamp();

        return { embed, totalPages, currentPage: validPage };
    } catch (error) {
        console.error(`Error reading category ${category}:`, error);
        throw error;
    }
}

/**
 * Tạo embed cho "All Commands" view
 * @param {number} page - Page number
 * @param {Client} client - Discord bot client
 * @returns {Promise<{embed: EmbedBuilder, totalPages: number, currentPage: number}>}
 */
export async function getAllCommandsEmbedAndPageCount(page = 1, client) {
    const commandsPath = path.join(__dirname, "../commands");
    const categoryDirs = (await fs.readdir(commandsPath, { withFileTypes: true }))
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .sort();

    try {
        const allCommands = [];

        // Collect all commands from all categories
        for (const category of categoryDirs) {
            const categoryPath = path.join(commandsPath, category);
            const files = (await fs.readdir(categoryPath))
                .filter(file => file.endsWith('.js'))
                .sort();

            for (const file of files) {
                const commandName = file.replace('.js', '');
                const filePath = path.join(categoryPath, file);
                const description = await getCommandDescription(filePath);
                const categoryName = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();

                allCommands.push({
                    name: commandName,
                    description,
                    category: categoryName,
                    icon: CATEGORY_ICONS[categoryName] || "🔍"
                });
            }
        }

        allCommands.sort((a, b) => a.name.localeCompare(b.name));

        const pageSize = 10;
        const totalPages = Math.ceil(allCommands.length / pageSize) || 1;
        
        // Validate page number - FIX: ensure page is within valid range
        const validPage = Math.max(1, Math.min(page, totalPages));
        
        const startIndex = (validPage - 1) * pageSize;
        const paginatedCommands = allCommands.slice(startIndex, startIndex + pageSize);

        const embed = createEmbed({
            title: `📋 All Commands`,
            description: `Page ${validPage} of ${totalPages} (Total: ${allCommands.length} commands)`,
            color: 'primary'
        });

        for (const cmd of paginatedCommands) {
            embed.addFields({
                name: `${cmd.icon} ${cmd.name}`,
                value: `${cmd.description}\n*Category: ${cmd.category}*`,
                inline: false
            });
        }

        embed.setFooter({ text: `Starlight Security | Page ${validPage}/${totalPages}` });
        embed.setTimestamp();

        return { embed, totalPages, currentPage: validPage };
    } catch (error) {
        console.error(`Error reading all commands:`, error);
        throw error;
    }
}

/**
 * Tạo pagination buttons cho help menu
 * Format customId: help:action:page:category
 * @param {number} currentPage - Current page number
 * @param {number} totalPages - Total number of pages
 * @param {string} category - Category name (or 'all' for all commands)
 * @returns {ActionRowBuilder}
 */
export function createHelpPaginationButtons(currentPage, totalPages, category = '') {
    const canGoBack = currentPage > 1;
    const canGoNext = currentPage < totalPages;

    const backButton = new ButtonBuilder()
        .setCustomId(`help:back:${currentPage - 1}:${category}`)
        .setLabel('← Back')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!canGoBack);

    const nextButton = new ButtonBuilder()
        .setCustomId(`help:next:${currentPage + 1}:${category}`)
        .setLabel('Next →')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!canGoNext);

    return new ActionRowBuilder().addComponents(backButton, nextButton);
}
