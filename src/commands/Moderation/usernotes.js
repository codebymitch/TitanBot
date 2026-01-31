import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

// Simple in-memory storage for user notes (in production, use database)
const userNotes = new Map();

export default {
    data: new SlashCommandBuilder()
        .setName("usernotes")
        .setDescription("Manage user notes for moderation purposes")
        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("Add a note to a user")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("The user to add a note for")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("note")
                        .setDescription("The note to add")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("Type of note")
                        .addChoices(
                            { name: "Warning", value: "warning" },
                            { name: "Positive", value: "positive" },
                            { name: "Neutral", value: "neutral" },
                            { name: "Alert", value: "alert" }
                        )
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("view")
                .setDescription("View notes for a user")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("The user to view notes for")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Remove a specific note from a user")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("The user to remove a note from")
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName("index")
                        .setDescription("The index of the note to remove")
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("clear")
                .setDescription("Clear all notes for a user")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("The user to clear notes for")
                        .setRequired(true)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    category: "moderation",

    async execute(interaction, config, client) {
        await interaction.deferReply({ flags: ["Ephemeral"] });

        // Permission check
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Permission Denied",
                        "You do not have permission to manage user notes."
                    ),
                ],
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser("target");
        const guildId = interaction.guild.id;

        // Initialize user notes if not exists
        if (!userNotes.has(guildId)) {
            userNotes.set(guildId, new Map());
        }
        const guildNotes = userNotes.get(guildId);

        // Initialize user's notes if not exists
        if (!guildNotes.has(targetUser.id)) {
            guildNotes.set(targetUser.id, []);
        }
        const notes = guildNotes.get(targetUser.id);

        try {
            switch (subcommand) {
                case "add":
                    return await handleAddNote(interaction, targetUser, notes);
                case "view":
                    return await handleViewNotes(interaction, targetUser, notes);
                case "remove":
                    return await handleRemoveNote(interaction, targetUser, notes);
                case "clear":
                    return await handleClearNotes(interaction, targetUser, notes);
                default:
                    return interaction.editReply({
                        embeds: [
                            errorEmbed(
                                "Invalid Subcommand",
                                "Please select a valid subcommand."
                            ),
                        ],
                    });
            }
        } catch (error) {
            logger.error(`Error in usernotes command (${subcommand}):`, error);
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "System Error",
                        "An error occurred while processing your request. Please try again later."
                    ),
                ],
            });
        }
    }
};

async function handleAddNote(interaction, targetUser, notes) {
    const note = interaction.options.getString("note");
    const type = interaction.options.getString("type") || "neutral";

    // Limit note length
    if (note.length > 1000) {
        return interaction.editReply({
            embeds: [
                errorEmbed(
                    "Note Too Long",
                    "Notes must be 1000 characters or less."
                ),
            ],
        });
    }

    // Add note
    const noteData = {
        id: Date.now(),
        content: note,
        type: type,
        author: interaction.user.tag,
        authorId: interaction.user.id,
        timestamp: new Date().toISOString()
    };

    notes.push(noteData);

    // Get type emoji and color
    const typeInfo = getNoteTypeInfo(type);

    return interaction.editReply({
        embeds: [
            successEmbed(
                `${typeInfo.emoji} Note Added`,
                `Added a **${type}** note for **${targetUser.tag}**:\n\n` +
                `> ${note}\n\n` +
                `**Moderator:** ${interaction.user.tag}\n` +
                `**Total Notes:** ${notes.length}`
            )
        ]
    });
}

async function handleViewNotes(interaction, targetUser, notes) {
    if (notes.length === 0) {
        return interaction.editReply({
            embeds: [
                infoEmbed(
                    "📝 No Notes",
                    `There are no notes for **${targetUser.tag}**.`
                ),
            ],
        });
    }

    // Sort notes by timestamp (newest first)
    const sortedNotes = [...notes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    let description = `**Notes for ${targetUser.tag} (${targetUser.id}):**\n\n`;
    
    sortedNotes.forEach((note, index) => {
        const typeInfo = getNoteTypeInfo(note.type);
        const date = new Date(note.timestamp).toLocaleDateString();
        description += `${typeInfo.emoji} **Note #${index + 1}** (${note.type}) - ${date}\n`;
        description += `> ${note.content}\n`;
        description += `*Added by ${note.author}*\n\n`;
    });

    // Check if description is too long
    if (description.length > 4000) {
        description = description.substring(0, 3900) + "\n... *(truncated)*";
    }

    return interaction.editReply({
        embeds: [
            infoEmbed(
                `📝 User Notes (${notes.length})`,
                description
            )
        ]
    });
}

async function handleRemoveNote(interaction, targetUser, notes) {
    const index = interaction.options.getInteger("index") - 1; // Convert to 0-based

    if (index < 0 || index >= notes.length) {
        return interaction.editReply({
            embeds: [
                errorEmbed(
                    "Invalid Index",
                    `Please provide a valid note index (1-${notes.length}).`
                ),
            ],
        });
    }

    const removedNote = notes[index];
    notes.splice(index, 1);

    const typeInfo = getNoteTypeInfo(removedNote.type);

    return interaction.editReply({
        embeds: [
            successEmbed(
                `${typeInfo.emoji} Note Removed`,
                `Removed note #${index + 1} from **${targetUser.tag}**:\n\n` +
                `> ${removedNote.content}\n\n` +
                `**Remaining Notes:** ${notes.length}`
            )
        ]
    });
}

async function handleClearNotes(interaction, targetUser, notes) {
    const noteCount = notes.length;
    
    if (noteCount === 0) {
        return interaction.editReply({
            embeds: [
                infoEmbed(
                    "No Notes to Clear",
                    `There are no notes for **${targetUser.tag}** to clear.`
                ),
            ],
        });
    }

    // Clear all notes
    notes.length = 0;

    return interaction.editReply({
        embeds: [
            successEmbed(
                "🗑️ Notes Cleared",
                `Cleared **${noteCount}** notes from **${targetUser.tag}**.`
            )
        ]
    });
}

function getNoteTypeInfo(type) {
    const types = {
        warning: { emoji: "⚠️", color: "#FF6B6B" },
        positive: { emoji: "✅", color: "#51CF66" },
        neutral: { emoji: "📝", color: "#74C0FC" },
        alert: { emoji: "🚨", color: "#FFD43B" }
    };
    
    return types[type] || types.neutral;
}
