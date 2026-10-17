import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";
import type { Command, NexoClient } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from "../../utils/embeds.js";
import { formatCategoryName, getCategoryIcon } from "../../config/commands/commandCategories.js";
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

export async function createInitialHelpMenu(client: NexoClient) {
    const commandsPath = path.join(__dirname, "../../commands");
    const categoryDirs = (
        await fs.readdir(commandsPath, { withFileTypes: true })
    )
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .sort();

    const options = [
        {
            label: "📋 Alle Commands",
            description: "Alle verfügbaren Commands in einer Liste durchsuchen",
            value: ALL_COMMANDS_ID,
        },
        ...categoryDirs.map((category) => {
            const categoryName = formatCategoryName(category);
            const icon = getCategoryIcon(category);
            return {
                label: `${icon} ${categoryName}`,
                description: `Commands der Kategorie ${categoryName} anzeigen`,
                value: category,
            };
        }),
    ];

    const botName = client?.user?.username || "Nexo";
    const embed = createEmbed({
        title: `📖 ${botName} – Hilfe`,
        description: 'Richte deinen Server ein, wähle aus, was aktiv sein soll, und stöbere dann unten durch die Commands.',
        color: 'primary',
        thumbnail: client.user?.displayAvatarURL?.({ size: 1024 }),
        fields: [
            {
                name: '🚀 Erste Schritte',
                value: [
                    '**1. Einrichtung starten** — Mit `/configwizard` legst du Prefix, Moderator-Rolle und Logs fest.',
                    '**2. Systeme aktivieren** — Mit `/commands dashboard` schaltest du Kategorien an oder aus.',
                    '**3. Commands entdecken** — Im Menü unten findest du alle Kategorien und Commands.',
                ].join('\n'),
                inline: false,
            },
            {
                name: 'ℹ️ So funktioniert’s',
                value: [
                    '• Dashboard-Commands verwalten jede Funktion übersichtlich',
                    '• Einstellungen werden pro Server gespeichert',
                    '• Slash-Commands und Prefix-Commands funktionieren, sobald sie aktiviert sind',
                ].join('\n'),
                inline: false,
            },
            {
                name: '\u200B',
                value: `-# ${botName} ist [Open Source](https://github.com/Robertwlt03/NexoBot)`,
                inline: false,
            },
        ],
    });

    embed.setFooter({ 
        text: "Ein Bot. Alle Funktionen. · Mit ❤️ gemacht" 
    });
    embed.setTimestamp();

    const bugReportButton = new ButtonBuilder()
        .setCustomId(BUG_REPORT_BUTTON_ID)
        .setLabel("Bug melden")
        .setStyle(ButtonStyle.Danger);


    const selectRow = createSelectMenu(
        CATEGORY_SELECT_ID,
        "Wähle eine Kategorie, um die Commands zu sehen",
        options,
    );

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents([
        bugReportButton,
    ]);

    return {
        embeds: [embed],
        components: [buttonRow, selectRow],
    };
}

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Zeigt das Hilfemenü mit allen verfügbaren Commands"),

    async execute(interaction, guildConfig, client) {
        
        const { MessageFlags } = await import('discord.js');
        await InteractionHelper.safeDefer(interaction);
        
        const { embeds, components } = await createInitialHelpMenu(client);

        await InteractionHelper.safeEditReply(interaction, {
            embeds,
            components,
        });

        setTimeout(async () => {
            try {
                if (!InteractionHelper.isInteractionValid(interaction)) {
                    return;
                }

                const closedEmbed = createEmbed({
                    title: "Hilfemenü geschlossen",
                    description: "Das Hilfemenü wurde geschlossen. Nutze /help erneut.",
                    color: "secondary",
                });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [closedEmbed],
                    components: [],
                });
            } catch (error) {
                logger.debug('Help menu close edit failed (interaction may have expired):', (error as Error | undefined)?.message);
            }
        }, HELP_MENU_TIMEOUT_MS);
    },
} satisfies Command;