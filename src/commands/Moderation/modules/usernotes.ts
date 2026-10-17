import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, type ChatInputCommandInteraction, type User } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { getFromDb, setInDb, deleteFromDb, getUserNotesKey, getUserNotesListKey } from '../../../utils/database.js';
import { sanitizeInput } from '../../../utils/validation.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';

export interface UserNote {
    id: number;
    content: string;
    type: string;
    author: string;
    authorId: string;
    timestamp: string;
}

export default {
    data: new SlashCommandBuilder()
        .setName("usernotes")
        .setDescription("Nutzernotizen für die Moderation verwalten")
        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("Eine Notiz zu einem Nutzer hinzufügen")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("Der Nutzer, zu dem du eine Notiz hinzufügen willst")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("note")
                        .setDescription("Die Notiz, die hinzugefügt werden soll")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("Art der Notiz")
                        .addChoices(
                            { name: "Warnung", value: "warning" },
                            { name: "Positiv", value: "positive" },
                            { name: "Neutral", value: "neutral" },
                            { name: "Alarm", value: "alert" }
                        )
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("view")
                .setDescription("Notizen zu einem Nutzer ansehen")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("Der Nutzer, dessen Notizen du sehen willst")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Eine bestimmte Notiz eines Nutzers entfernen")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("Der Nutzer, von dem du eine Notiz entfernen willst")
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName("index")
                        .setDescription("Die Nummer der Notiz, die entfernt werden soll")
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("clear")
                .setDescription("Alle Notizen eines Nutzers löschen")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("Der Nutzer, dessen Notizen gelöscht werden sollen")
                        .setRequired(true)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    category: "moderation",

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser("target");
        const guildId = interaction.guild!.id;

        if (subcommand !== "view" && subcommand !== "remove" && subcommand !== "clear" && subcommand !== "add") {
            return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Bitte wähl einen gültigen Subcommand.' });
        }

        let notes: UserNote[] = [];
        if (targetUser) {
            const notesKey = getUserNotesKey(guildId, targetUser.id);
            notes = await getFromDb<UserNote[]>(notesKey, []);
        }

        try {
            switch (subcommand) {
                case "add":
                    return await handleAddNote(interaction, targetUser!, notes, guildId);
                case "view":
                    return await handleViewNotes(interaction, targetUser!, notes);
                case "remove":
                    return await handleRemoveNote(interaction, targetUser!, notes, guildId);
                case "clear":
                    return await handleClearNotes(interaction, targetUser!, notes, guildId);
                default:
                    return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Bitte wähl einen gültigen Subcommand.' });
            }
        } catch (error) {
            logger.error(`Error in usernotes command (${subcommand}):`, error);
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Bei deiner Anfrage ist ein Fehler aufgetreten. Bitte versuch es später noch einmal.' });
        }
    }
} satisfies Command;

async function handleAddNote(interaction: ChatInputCommandInteraction, targetUser: User, notes: UserNote[], guildId: string) {
    let note = interaction.options.getString("note")!.trim();
    const type = interaction.options.getString("type") || "neutral";

    if (note.length > 1000) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Notizen dürfen höchstens 1000 Zeichen lang sein.' });
    }

    if (note.length === 0) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Die Notiz darf nicht leer sein.' });
    }

    note = sanitizeInput(note);

    const noteData: UserNote = {
        id: Date.now(),
        content: note,
        type: type,
        author: interaction.user.tag,
        authorId: interaction.user.id,
        timestamp: new Date().toISOString()
    };

    notes.push(noteData);

    const notesKey = getUserNotesKey(guildId, targetUser.id);
    await setInDb(notesKey, notes);

    const typeInfo = getNoteTypeInfo(type);

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            successEmbed(
                `${typeInfo.emoji} Notiz hinzugefügt`,
                `Notiz (**${typeInfo.label}**) für **${targetUser.tag}** hinzugefügt:\n\n` +
                `> ${note}\n\n` +
                `**Moderator:** ${interaction.user.tag}\n` +
                `**Notizen gesamt:** ${notes.length}`
            )
        ]
    });
}

async function handleViewNotes(interaction: ChatInputCommandInteraction, targetUser: User, notes: UserNote[]) {
    if (notes.length === 0) {
        return InteractionHelper.safeReply(interaction, {
            embeds: [
                infoEmbed(
                    "📝 Keine Notizen",
                    `Zu **${targetUser.tag}** gibt es keine Notizen.`
                ),
            ],
        });
    }

    const sortedNotes = [...notes].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    let description = `**Notizen zu ${targetUser.tag} (${targetUser.id}):**\n\n`;
    
    sortedNotes.forEach((note, index) => {
        const typeInfo = getNoteTypeInfo(note.type);
        const date = new Date(note.timestamp).toLocaleDateString();
        description += `${typeInfo.emoji} **Notiz #${index + 1}** (${typeInfo.label}) - ${date}\n`;
        description += `> ${note.content}\n`;
        description += `*Hinzugefügt von ${note.author}*\n\n`;
    });

    if (description.length > 4000) {
        description = description.substring(0, 3900) + "\n... *(gekürzt)*";
    }

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            infoEmbed(
                `📝 Nutzernotizen (${notes.length})`,
                description
            )
        ]
    });
}

async function handleRemoveNote(interaction: ChatInputCommandInteraction, targetUser: User, notes: UserNote[], guildId: string) {
    const index = interaction.options.getInteger("index")! - 1;

    if (index < 0 || index >= notes.length) {
        return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: `Bitte gib eine gültige Notiznummer an (1-${notes.length}).` });
    }

    // The view command displays notes sorted newest-first, so resolve the index
    // against the same ordering to delete the note the user actually sees.
    const sortedNotes = [...notes].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const removedNote = sortedNotes[index];
    const originalIndex = notes.indexOf(removedNote);
    notes.splice(originalIndex, 1);

    const notesKey = getUserNotesKey(guildId, targetUser.id);
    await setInDb(notesKey, notes);

    const typeInfo = getNoteTypeInfo(removedNote.type);

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            successEmbed(
                `${typeInfo.emoji} Notiz entfernt`,
                `Notiz #${index + 1} von **${targetUser.tag}** entfernt:\n\n` +
                `> ${removedNote.content}\n\n` +
                `**Verbleibende Notizen:** ${notes.length}`
            )
        ]
    });
}

async function handleClearNotes(interaction: ChatInputCommandInteraction, targetUser: User, notes: UserNote[], guildId: string) {
    const noteCount = notes.length;
    
    if (noteCount === 0) {
        return InteractionHelper.safeReply(interaction, {
            embeds: [
                infoEmbed(
                    "Keine Notizen zum Löschen",
                    `Zu **${targetUser.tag}** gibt es keine Notizen zum Löschen.`
                ),
            ],
        });
    }

    notes.length = 0;

    const notesKey = getUserNotesKey(guildId, targetUser.id);
    await setInDb(notesKey, notes);

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            successEmbed(
                "🗑️ Notizen gelöscht",
                `**${noteCount}** Notizen von **${targetUser.tag}** gelöscht.`
            )
        ]
    });
}

function getNoteTypeInfo(type: string) {
    const types: Record<string, { emoji: string; color: string; label: string }> = {
        warning: { emoji: "⚠️", color: "#FF6B6B", label: "Warnung" },
        positive: { emoji: "✅", color: "#51CF66", label: "Positiv" },
        neutral: { emoji: "📝", color: "#74C0FC", label: "Neutral" },
        alert: { emoji: "🚨", color: "#FFD43B", label: "Alarm" }
    };
    
    return types[type] || types.neutral;
}