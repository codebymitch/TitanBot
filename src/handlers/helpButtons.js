import { createEmbed } from '../utils/embeds.js';
import { createButton, createSelectMenu, getPaginationRow } from '../utils/components.js';
import { createAllCommandsMenu } from './helpSelectMenus.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Collection, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COMMAND_LIST_ID = "help-command-list";
const BACK_BUTTON_ID = "help-back-to-main";
const CATEGORY_SELECT_ID = "help-category-select";
const ALL_COMMANDS_ID = "help-all-commands";
const PAGINATION_PREFIX = "help-page";
const BUG_REPORT_BUTTON_ID = "help-bug-report";

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

async function createCategorySelectMenu() {
    const commandsPath = path.join(__dirname, "../commands");
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
            const icon = CATEGORY_ICONS[categoryName] || "🔍";
            return {
                label: `${icon} ${categoryName}`,
                description: `View commands in the ${categoryName} category`,
                value: category,
            };
        }),
    ];

    const embed = createEmbed({
        title: "🤖 TitanBot Help Center",
        description: "Your all-in-one Discord companion for moderation, economy, fun, and server management.\n\nSelect a category below to explore our powerful commands:",
        color: 'primary'
    });

    embed.addFields(
        {
            name: "🛡️ **Moderation**",
            value: "Server moderation, user management, and enforcement tools",
            inline: true
        },
        {
            name: "💰 **Economy**",
            value: "Currency system, shops, and virtual economy",
            inline: true
        },
        {
            name: "🎮 **Fun**",
            value: "Games, entertainment, and interactive commands",
            inline: true
        },
        {
            name: "📊 **Leveling**",
            value: "User levels, XP system, and progression tracking",
            inline: true
        },
        {
            name: "🎫 **Tickets**",
            value: "Support ticket system for server management",
            inline: true
        },
        {
            name: "🎉 **Giveaways**",
            value: "Automated giveaway management and distribution",
            inline: true
        },
        {
            name: "👋 **Welcome**",
            value: "Member welcome messages and onboarding",
            inline: true
        },
        {
            name: "🎂 **Birthdays**",
            value: "Birthday tracking and celebration features",
            inline: true
        },
        {
            name: "🔧 **Utilities**",
            value: "Useful tools and server utilities",
            inline: true
        }
    );

    embed.setFooter({
        text: "Made with ❤️"
    });
    embed.setTimestamp();

    const bugReportButton = new ButtonBuilder()
        .setCustomId(BUG_REPORT_BUTTON_ID)
        .setLabel("Report Bug")
        .setStyle(ButtonStyle.Danger);

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
        bugReportButton,
        supportButton,
        touchpointButton,
    ]);

    return {
        embeds: [embed],
        components: [buttonRow, selectRow],
    };
}

export const helpBackButton = {
    name: BACK_BUTTON_ID,
    async execute(interaction, client) {
        const { embeds, components } = await createCategorySelectMenu();
        await interaction.update({
            embeds,
            components,
        });
    },
};

export const helpBugReportButton = {
    name: BUG_REPORT_BUTTON_ID,
    async execute(interaction, client) {
        const githubButton = new ButtonBuilder()
            .setLabel('🐛 Report Bug on GitHub')
            .setStyle(ButtonStyle.Link)
            .setURL('https://github.com/codebymitch/TitanBot/issues');

        const bugRow = new ActionRowBuilder().addComponents(githubButton);

        const bugReportEmbed = createEmbed({
            title: '🐛 Bug Report',
            description: 'Found a bug? Please report it on our GitHub Issues page!\n\n' +
                '**When reporting a bug, please include:**\n' +
                '• 📝 Detailed description of the issue\n' +
                '• 📋 Steps to reproduce the problem\n' +
                '• 📸 Screenshots if applicable\n' +
                '• 💻 Your bot version and environment\n\n' +
                'This helps us fix issues faster and more effectively!',
            color: 'error'
        });
        bugReportEmbed.setFooter({
            text: 'TitanBot Bug Reporting System',
            iconURL: client.user.displayAvatarURL()
        });
        bugReportEmbed.setTimestamp();

        await interaction.reply({
            embeds: [bugReportEmbed],
            components: [bugRow],
            flags: MessageFlags.Ephemeral
        });
    },
};

export const helpReportCommand = {
    name: COMMAND_LIST_ID,
    categoryName: null,
    async execute(interaction, client) {
        
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
        await interaction.update({ embeds, components });
    },
};


