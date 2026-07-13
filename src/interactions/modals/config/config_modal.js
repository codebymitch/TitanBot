import { successEmbed } from '../../../utils/embeds.js';

import ConfigService from '../../../services/config/configService.js';
import { MessageFlags } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';

function extractId(value) {
    if (!value || typeof value !== 'string') return null;

    const channelMention = value.match(/^<#(\d+)>$/);
    if (channelMention) return channelMention[1];

    const roleMention = value.match(/^<@&(\d+)>$/);
    if (roleMention) return roleMention[1];

    const digits = value.match(/^(\d{17,19})$/);
    if (digits) return digits[1];

    return null;
}

function parseValue(key, rawValue) {
    const value = rawValue.trim();

    if (['modRole', 'adminRole', 'autoRole', 'logChannelId'].includes(key)) {
        if (value.toLowerCase() === 'none') {
            return null;
        }
        const id = extractId(value);
        if (!id) {
            throw new Error('Please provide a valid mention or ID.');
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
        throw new Error('Please enter either yes or no.');
    }

    if (key === 'prefix') {
        if (value.length < 1 || value.length > 10 || /\s/.test(value)) {
            throw new Error('Prefix must be 1-10 characters with no spaces.');
        }
        return value;
    }

    return value;
}

function resolveModalValue(key, interaction) {
    if (key === 'logChannelId') {
        const channelId = interaction.fields.getField('log_channel')?.values?.[0];
        if (!channelId) {
            throw new Error('Please select a log channel.');
        }
        return channelId;
    }

    if (key === 'modRole') {
        const roleId = interaction.fields.getField('mod_role')?.values?.[0];
        if (!roleId) {
            throw new Error('Please select a moderator role.');
        }
        return roleId;
    }

    const rawValue = interaction.fields.getTextInputValue('value');
    return parseValue(key, rawValue);
}

function buildSuccessMessage(key, value, guild) {
    if (key === 'logChannelId') {
        const channel = guild?.channels?.cache?.get(value);
        return `Log channel set to ${channel ?? `<#${value}>`}.`;
    }

    if (key === 'modRole') {
        const role = guild?.roles?.cache?.get(value);
        return `Moderator role set to ${role ?? `<@&${value}>`}.`;
    }

    return `The setting \`${key}\` has been updated successfully.`;
}

export default {
    name: 'config_modal',
    async execute(interaction) {
        const [key, guildId] = interaction.customId.split(':').slice(1);

        try {
            const value = resolveModalValue(key, interaction);
            await ConfigService.updateSetting(interaction.client, guildId, key, value, interaction.user.id);

            await interaction.reply({
                embeds: [successEmbed('Configuration Updated', buildSuccessMessage(key, value, interaction.guild))],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            logger.error('Config modal handler error:', error);
            await replyUserError(interaction, { type: ErrorTypes.CONFIGURATION, message: error.message || 'Please try again.' });
        }
    },
};
