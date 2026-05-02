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

    const botName = client?.user?.username || "Bot";
    const embed = createEmbed({ 
        title: `🤖 ${botName} меню`,
        description: "Универсальный бот для Discord сервера ARBZ Famq, -# @kreze25",
        color: 'primary'
    });

    embed.addFields(
        {
            name: "🛡️ **Модерация**",
            value: "Инструменты для модерации сервера, управления пользователями и контроля",
            inline: true
        },
        {
            name: "💰 **Экономика**",
            value: "Валютная система, магазины и виртуальная экономика",
            inline: true
        },
        {
            name: "🎮 **Развлечения**",
            value: "Игры, развлечения и интерактивные команды",
            inline: true
        },
        {
            name: "📊 **Ранжировка**",
            value: "Уровни пользователей, система опыта и отслеживание прогресса",
            inline: true
        },
        {
            name: "🎫 **Билеты**",
            value: "Система заявок в службу поддержки для управления сервером",
            inline: true
        },
        {
            name: "🎉 **Розыгрыши призов**",
            value: "Автоматизированное управление раздачей подарков и их распространение",
            inline: true
        },
        {
            name: "👋 **Приветствие**",
            value: "Приветственные сообщения",
            inline: true
        },
        {
            name: "👥 **Сообщество**",
            value: "Инструменты, приложения и способы взаимодействия с сообществом",
            inline: true
        },
        {
            name: "⚙️ **Конфиг**",
            value: "Команды для управления конфига сервера и ботов",
            inline: true
        },
        {
            name: "🔢 **Контроллер**",
            value: "Настройка канала для контроля в реальном времени и управление контролем",
            inline: true
        },
        {
            name: "🎙️ **Присоединяйтесь, чтобы создать**",
            value: "Создание и управление динамическими голосовыми каналами",
            inline: true
        },
        {
            name: "🎭 **Reaction Roles**",
            value: "Self-assignable roles using reaction-role systems",
            inline: true
        },
        {
            name: "✅ **Верификация**",
            value: "Member verification workflows and access gating",
            inline: true
        },
        {
            name: "🔧 **Утилиты**",
            value: "Полезные инструменты и серверные утилиты",
            inline: true
        }
    );

    embed.setFooter({ 
        text: "🍉ARBUZ FAMQ🍉" 
    });
    embed.setTimestamp();

    const bugReportButton = new ButtonBuilder()
        .setCustomId(BUG_REPORT_BUTTON_ID)
        .setLabel("Нашли баги?")
        .setStyle(ButtonStyle.Danger);

    const supportButton = new ButtonBuilder()
        .setLabel("Поддержать сервер")
        .setURL("https://boosty.to/arbuzfamq")
        .setStyle(ButtonStyle.Link);

    const selectRow = createSelectMenu(
        CATEGORY_SELECT_ID,
        "Выберите, чтобы просмотреть команды",
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
        .setDescription("Отображает меню справки со всеми доступными командами"),

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
                const closedEmbed = createEmbed({
                    title: "Меню справки закрыто",
                    description: "Меню справки закрыто, введите /help еще раз.",
                    color: "secondary",
                });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [closedEmbed],
                    components: [],
                });
            } catch (error) {
                
            }
        }, HELP_MENU_TIMEOUT_MS);
    },
};


