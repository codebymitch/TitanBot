import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";
import { createEmbed } from "../../utils/embeds.js";
import {
    createSelectMenu,
} from "../../utils/components.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATEGORY_SELECT_ID = "help-category-select";
const ALL_COMMANDS_ID = "help-all-commands";
const BUG_REPORT_BUTTON_ID = "help-bug-report";
const HELP_MENU_TIMEOUT_MS = 5 * 60 * 1000;

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
async function createInitialHelpMenu() {
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
        description: "Your all-in-one Discord companion for moderation, economy, fun, and server management.",
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
            name: "👥 **Community**",
            value: "Community tools, applications, and member engagement",
            inline: true
        },
        {
            name: "⚙️ **Config**",
            value: "Server and bot configuration management commands",
            inline: true
        },
        {
            name: "🔢 **Counter**",
            value: "Live counter channel setup and counter controls",
            inline: true
        },
        {
            name: "🎙️ **Join to Create**",
            value: "Dynamic voice channel creation and management",
            inline: true
        },
        {
            name: "🎭 **Reaction Roles**",
            value: "Self-assignable roles using reaction-role systems",
            inline: true
        },
        {
            name: "✅ **Verification**",
            value: "Member verification workflows and access gating",
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

export default {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Displays the help menu with all available commands"),

    async execute(interaction, guildConfig, client) {
        // Defer reply to avoid timeout (filesystem operations take time)
        const { MessageFlags } = await import('discord.js');
        await interaction.deferReply();
        
        const { embeds, components } = await createInitialHelpMenu();

        await interaction.editReply({
            embeds,
            components,
        });

        setTimeout(async () => {
            try {
                const closedEmbed = createEmbed({
                    title: "Help menu closed",
                    description: "Help menu has been closed, use /help again.",
                    color: "secondary",
                });

                await interaction.editReply({
                    embeds: [closedEmbed],
                    components: [],
                });
            } catch (error) {
                // Message might be deleted or no longer editable.
            }
        }, HELP_MENU_TIMEOUT_MS);
    },
};


