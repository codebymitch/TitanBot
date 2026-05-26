import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";
import { InteractionHelper } from '../../utils/interactionHelper.js';
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

export async function createInitialHelpMenu(client) {
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

    const botName = client?.user?.username || "Starlight Security";
    const embed = createEmbed({ 
        title: `🤖 ${botName} Help Center`,
        description: "Welcome to Starlight Security! Your all-in-one companion for server protection and management.",
        color: 'primary'
    });

    embed.addFields(
        { name: "🛡️ **Moderation**", value: "Server moderation, user management, and enforcement tools", inline: true },
        { name: "🎮 **Fun**", value: "Games, entertainment, and interactive commands", inline: true },
        { name: "📊 **Leveling**", value: "User levels, XP system, and progression tracking", inline: true },
        { name: "🎫 **Tickets**", value: "Support ticket system for server management", inline: true },
        { name: "🎉 **Giveaways**", value: "Automated giveaway management and distribution", inline: true },
        { name: "👋 **Welcome**", value: "Member welcome messages and onboarding", inline: true },
        { name: "🎂 **Birthdays**", value: "Birthday tracking and celebration features", inline: true },
        { name: "👥 **Community**", value: "Community tools, applications, and member engagement", inline: true },
        { name: "⚙️ **Config**", value: "Server and bot configuration management commands", inline: true },
        { name: "🔢 **Counter**", value: "Live counter channel setup and counter controls", inline: true },
        { name: "🎙️ **Join to Create**", value: "Dynamic voice channel creation and management", inline: true },
        { name: "🎭 **Reaction Roles**", value: "Self-assignable roles using reaction-role systems", inline: true },
        { name: "✅ **Verification**", value: "Member verification workflows and access gating", inline: true },
        { name: "🔧 **Utilities**", value: "Useful tools and server utilities", inline: true }
    );

    embed.setFooter({ text: "Starlight Security | Secured by Dev" });
    embed.setTimestamp();

    const bugReportButton = new ButtonBuilder()
        .setCustomId(BUG_REPORT_BUTTON_ID)
        .setLabel("Contact Developer")
        .setStyle(ButtonStyle.Primary);

    const selectRow = createSelectMenu(
        CATEGORY_SELECT_ID,
        "Select to view the commands",
        options,
    );

    const buttonRow = new ActionRowBuilder().addComponents([
        bugReportButton,
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
        await InteractionHelper.safeDefer(interaction);
        const { embeds, components } = await createInitialHelpMenu(client);

        await InteractionHelper.safeEditReply(interaction, {
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
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [closedEmbed],
                    components: [],
                });
            } catch (error) {}
        }, HELP_MENU_TIMEOUT_MS);
    },
};
