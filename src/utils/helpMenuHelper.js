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
 * Tạo embed cho một category cụ thể với pagination
 * @param {string} category - Category name
 * @param {number} page - Page number
 * @param {Client} client - Discord bot client
 * @returns {Promise<{embed: EmbedBuilder, totalPages: number}>}
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
        
        // Validate page number
        const validPage = Math.max(1, Math.min(page, totalPages));
        
        const startIndex = (validPage - 1) * pageSize;
        const paginatedFiles = files.slice(startIndex, startIndex + pageSize);

        const embed = createEmbed({
            title: `${icon} ${categoryName} Commands`,
            description: `Page ${validPage} of ${totalPages}`,
            color: 'primary'
        });

        paginatedFiles.forEach(file => {
            const commandName = file.replace('.js', '');
            embed.addFields({
                name: `• ${commandName}`,
                value: "No description available",
                inline: false
            });
        });

        embed.setFooter({ text: `Starlight Security | Page ${validPage}/${totalPages}` });
        embed.setTimestamp();

        return { embed, totalPages, currentPage: validPage };
    } catch (error) {
        console.error(`Error reading category ${category}:`, error);
        throw error;
    }
}

/**
 * Tạo pagination buttons cho help menu
 * @param {number} currentPage - Current page number
 * @param {number} totalPages - Total number of pages
 * @param {string} action - 'category' để biết đang xem category nào (nếu cần)
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
