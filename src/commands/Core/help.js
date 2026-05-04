import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from "../../utils/embeds.js";
import { createSelectMenu } from "../../utils/components.js";
import { getAccessibleCategories } from "../../handlers/helpSelectMenus.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATEGORY_SELECT_ID = "help-category-select";
const ALL_COMMANDS_ID = "help-all-commands";
const HELP_MENU_TIMEOUT_MS = 5 * 60 * 1000;

const CATEGORY_INFO = {
    Core:           { icon: "ℹ️",  desc: "Core bot commands and information" },
    Moderation:     { icon: "🛡️",  desc: "Server moderation, user management, enforcement tools, and NSFW content detection" },
    Fun:            { icon: "🎮",  desc: "Games, entertainment, and interactive commands" },
    Leveling:       { icon: "📊",  desc: "User levels, XP system, and progression tracking" },
    Utility:        { icon: "🔧",  desc: "Useful tools and server utilities" },
    Ticket:         { icon: "🎫",  desc: "Support ticket system for server management" },
    Welcome:        { icon: "👋",  desc: "Member welcome messages and onboarding" },
    Giveaway:       { icon: "🎉",  desc: "Automated giveaway management and distribution" },
    Tools:          { icon: "🛠️",  desc: "Embed builder, polls, and other creation tools" },
    Search:         { icon: "🔍",  desc: "Search YouTube, Wikipedia, GitHub, and more" },
    Reaction_roles: { icon: "🎭",  desc: "Self-assignable roles using reaction-role systems" },
    Community:      { icon: "👥",  desc: "Community tools, applications, and member engagement" },
    Jointocreate:   { icon: "🎙️",  desc: "Dynamic voice channel creation and management" },
    Verification:   { icon: "✅",  desc: "Member verification workflows and access gating" },
    Serverstats:    { icon: "📈",  desc: "Server statistics and display counters" },
    Logging:        { icon: "📋",  desc: "Server event logging and audit trails" },
    Voice:          { icon: "🔊",  desc: "Voice channel commands and activities" },
};

export async function createInitialHelpMenu(client, member) {
    const commandsPath = path.join(__dirname, "../../commands");
    const categoryDirs = (
        await fs.readdir(commandsPath, { withFileTypes: true })
    )
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .sort();

    // Build the set of categories this member has access to
    const accessibleCategories = getAccessibleCategories(client, member);

    const filteredCategories = categoryDirs.filter((category) => {
        if (category.toLowerCase() === 'economy') return false;
        if (!accessibleCategories) return true; // no member (DM) → show all
        return accessibleCategories.has(category);
    });

    const options = [
        {
            label: "📋 All Commands",
            description: "View all commands available to you",
            value: ALL_COMMANDS_ID,
        },
        ...filteredCategories.map((category) => {
            const categoryName =
                category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
            const info = CATEGORY_INFO[categoryName] || { icon: "🔍", desc: `Commands in the ${categoryName} category` };
            return {
                label: `${info.icon} ${categoryName}`,
                description: `View ${categoryName.toLowerCase()} commands`,
                value: category,
            };
        }),
    ];

    const botName = client?.user?.username || "Bot";
    const embed = createEmbed({
        title: `🤖 ${botName} Help Center`,
        description: "Showing commands available based on your permissions. Select a category to explore.",
        color: 'primary',
    });

    // Dynamically add fields only for categories this member can access
    const fields = filteredCategories.map((category) => {
        const categoryName =
            category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
        const info = CATEGORY_INFO[categoryName] || { icon: "🔍", desc: `Commands in the ${categoryName} category` };
        return {
            name: `${info.icon} **${categoryName}**`,
            value: info.desc,
            inline: true,
        };
    });

    if (fields.length > 0) {
        embed.addFields(fields);
    }

    embed.setFooter({ text: "Made with ❤️" });
    embed.setTimestamp();

    const supportButton = new ButtonBuilder()
        .setLabel("Support Server")
        .setURL("https://discord.gg/ECPhU7FWTA")
        .setStyle(ButtonStyle.Link);

    const selectRow = createSelectMenu(
        CATEGORY_SELECT_ID,
        "Select to view the commands",
        options,
    );

    const buttonRow = new ActionRowBuilder().addComponents([supportButton]);

    return {
        embeds: [embed],
        components: [buttonRow, selectRow],
    };
}

export default {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Displays commands available to you based on your permissions"),

    async execute(interaction, guildConfig, client) {
        await InteractionHelper.safeDefer(interaction, { ephemeral: true });

        const { embeds, components } = await createInitialHelpMenu(client, interaction.member);

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
            } catch (_) {}
        }, HELP_MENU_TIMEOUT_MS);
    },
};
