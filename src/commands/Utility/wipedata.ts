import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, warningEmbed } from '../../utils/embeds.js';
import { getConfirmationButtons } from '../../utils/components.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import type { Command } from '../../types/index.js';
export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('wipedata')
        .setDescription('Lösche alle deine persönlichen Daten aus dem Bot (unwiderruflich)'),

    async execute(interaction, guildConfig, client) {
        const warningMessage = 
            `⚠️ **DIESE AKTION KANN NICHT RÜCKGÄNGIG GEMACHT WERDEN!** ⚠️\n\n` +
            `Damit werden **ALLE** deine Daten auf diesem Server dauerhaft gelöscht, darunter:\n` +
            `• 💰 Kontostand (Geldbörse & Bank)\n` +
            `• 📊 Level und XP\n` +
            `• 🎒 Items im Inventar\n` +
            `• 🛍️ Shop-Käufe\n` +
            `• 🎂 Geburtstagsdaten\n` +
            `• 🔢 Zählerdaten\n` +
            `• 📋 Alle weiteren persönlichen Daten\n\n` +
            `**Das lässt sich nicht rückgängig machen. Bist du dir ganz sicher?**`;

        const embed = warningEmbed('Alle Daten löschen', warningMessage);

        const confirmButtons = getConfirmationButtons('wipedata');

        await InteractionHelper.safeReply(interaction, {
            embeds: [embed],
            components: [confirmButtons],
            flags: MessageFlags.Ephemeral
        });

        logger.info(`Wipedata command executed - confirmation prompt shown`, {
            userId: interaction.user.id,
            guildId: interaction.guildId
        });
    }
} satisfies Command;