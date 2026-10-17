import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { handleCreate } from './modules/serverstats_create.js';
import { handleList } from './modules/serverstats_list.js';
import { handleUpdate } from './modules/serverstats_update.js';
import { handleDelete } from './modules/serverstats_delete.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import type { Command } from '../../types/index.js';
export default {
    data: new SlashCommandBuilder()
        .setName("serverstats")
        .setDescription("Serverstatistiken verwalten, die Mitgliederzahlen und Kanaldaten erfassen")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(subcommand =>
            subcommand
                .setName("create")
                .setDescription("Neuen Statistik-Kanal in einer Kategorie erstellen")
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("Art der zu erfassenden Statistik")
                        .setRequired(true)
                        .addChoices(
                            { name: "Mitglieder + Bots", value: "members" },
                            { name: "nur Mitglieder", value: "members_only" },
                            { name: "nur Bots", value: "bots" }
                        )
                )
                .addStringOption(option =>
                    option
                        .setName("channel_type")
                        .setDescription("Kanaltyp, der für diesen Zähler erstellt wird")
                        .setRequired(true)
                        .addChoices(
                            { name: "Sprachkanal (empfohlen)", value: "voice" },
                            { name: "Textkanal", value: "text" }
                        )
                )
                .addChannelOption(option =>
                    option
                        .setName("category")
                        .setDescription("Kategorie, in der der Statistik-Kanal erstellt wird")
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildCategory)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("list")
                .setDescription("Alle Statistik-Zähler dieses Servers anzeigen")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("update")
                .setDescription("Bestehenden Statistik-Zähler aktualisieren")
                .addStringOption(option =>
                    option
                        .setName("counter-id")
                        .setDescription("ID des zu aktualisierenden Zählers")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("Neuer Zählertyp")
                        .setRequired(false)
                        .addChoices(
                            { name: "Mitglieder + Bots", value: "members" },
                            { name: "nur Mitglieder", value: "members_only" },
                            { name: "nur Bots", value: "bots" }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("delete")
                .setDescription("Bestehenden Statistik-Zähler löschen")
                .addStringOption(option =>
                    option
                        .setName("counter-id")
                        .setDescription("ID des zu löschenden Zählers")
                        .setRequired(true)
                )
        ),

    async execute(interaction, guildConfig, client) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case "create":
                await handleCreate(interaction, client);
                break;
            case "list":
                await handleList(interaction, client);
                break;
            case "update":
                await handleUpdate(interaction, client);
                break;
            case "delete":
                await handleDelete(interaction, client);
                break;
            default:
                await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Unbekannter Subcommand.' });
        }
    }
} satisfies Command;