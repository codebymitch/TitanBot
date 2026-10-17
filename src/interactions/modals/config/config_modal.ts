import { successEmbed } from '../../../utils/embeds.js';

import ConfigService from '../../../services/config/configService.js';
import { MessageFlags } from 'discord.js';
import type { Guild, ModalSubmitInteraction, SelectMenuModalData } from 'discord.js';
import type { ModalHandler } from '../../../types/index.js';
import { logger } from '../../../utils/logger.js';
import { ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';

function extractId(value: unknown): string | null {
    if (!value || typeof value !== 'string') return null;

    const channelMention = value.match(/^<#(\d+)>$/);
    if (channelMention) return channelMention[1];

    const roleMention = value.match(/^<@&(\d+)>$/);
    if (roleMention) return roleMention[1];

    const digits = value.match(/^(\d{17,19})$/);
    if (digits) return digits[1];

    return null;
}

function parseValue(key: string, rawValue: string): string | boolean | null {
    const value = rawValue.trim();

    if (['modRole', 'adminRole', 'autoRole', 'logChannelId'].includes(key)) {
        if (value.toLowerCase() === 'none') {
            return null;
        }
        const id = extractId(value);
        if (!id) {
            throw new Error('Bitte gib eine gültige Erwähnung oder ID an.');
        }
        return id;
    }

    if (key === 'dmOnClose') {
        if (['yes', 'true', 'enabled', 'enable'].includes(value.toLowerCase())) {
            return true;
        }
        if (['no', 'false', 'disabled', 'disable'].includes(value.toLowerCase())) {
            return false;
        }
        throw new Error('Bitte gib entweder „yes“ oder „no“ ein.');
    }

    if (key === 'prefix') {
        if (value.length < 1 || value.length > 10 || /\s/.test(value)) {
            throw new Error('Der Präfix muss 1–10 Zeichen lang sein und darf keine Leerzeichen enthalten.');
        }
        return value;
    }

    return value;
}

function resolveModalValue(key: string, interaction: ModalSubmitInteraction): string | boolean | null {
    if (key === 'logChannelId') {
        const channelId = (interaction.fields.getField('log_channel') as SelectMenuModalData)?.values?.[0];
        if (!channelId) {
            throw new Error('Bitte wähl einen Log-Kanal aus.');
        }
        return channelId;
    }

    if (key === 'modRole') {
        const roleId = (interaction.fields.getField('mod_role') as SelectMenuModalData)?.values?.[0];
        if (!roleId) {
            throw new Error('Bitte wähl eine Moderator-Rolle aus.');
        }
        return roleId;
    }

    const rawValue = interaction.fields.getTextInputValue('value');
    return parseValue(key, rawValue);
}

function buildSuccessMessage(key: string, value: string | boolean | null, guild: Guild | null): string {
    if (key === 'logChannelId') {
        const channel = guild?.channels?.cache?.get(String(value));
        return `Log-Kanal auf ${channel ?? `<#${value}>`} gesetzt.`;
    }

    if (key === 'modRole') {
        const role = guild?.roles?.cache?.get(String(value));
        return `Moderator-Rolle auf ${role ?? `<@&${value}>`} gesetzt.`;
    }

    return `Die Einstellung \`${key}\` wurde erfolgreich aktualisiert.`;
}

export default {
    name: 'config_modal',
    async execute(interaction) {
        const [key, guildId] = interaction.customId.split(':').slice(1);

        try {
            const value = resolveModalValue(key, interaction);
            await ConfigService.updateSetting(interaction.client, guildId, key, value, interaction.user.id);

            await interaction.reply({
                embeds: [successEmbed('Konfiguration aktualisiert', buildSuccessMessage(key, value, interaction.guild))],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            logger.error('Config modal handler error:', error);
            await replyUserError(interaction, { type: ErrorTypes.CONFIGURATION, message: (error instanceof Error && error.message) || 'Bitte versuch es erneut.' });
        }
    },
} satisfies ModalHandler;
