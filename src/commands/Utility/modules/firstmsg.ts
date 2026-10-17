import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, type GuildTextBasedChannel } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';
import type { Command } from '../../../types/index.js';
export default {
    data: new SlashCommandBuilder()
        .setName("firstmsg")
        .setDescription("Link zur ersten Nachricht in diesem Kanal")
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
    category: "Utility",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`FirstMsg interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'firstmsg'
            });
            return;
        }

        const messages = await (interaction.channel as GuildTextBasedChannel).messages.fetch({
            limit: 1,
            after: '1',
            cache: false
        });

        const firstMessage = messages.first();

        if (!firstMessage) {
            logger.info(`FirstMsg - no messages found in channel`, {
                userId: interaction.user.id,
                channelId: interaction.channelId,
                guildId: interaction.guildId
            });
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed('Erste Nachricht', "In diesem Kanal wurden keine Nachrichten gefunden!")],
            });
        }

        const messageLink = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${firstMessage.id}`;

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    "Erste Nachricht in #" + (interaction.channel as GuildTextBasedChannel).name,
                    `Link zur Nachricht: ${messageLink}`
                ),
            ],
        });

        logger.info(`FirstMsg command executed`, {
            userId: interaction.user.id,
            channelId: interaction.channelId,
            messageId: firstMessage.id,
            guildId: interaction.guildId
        });
    },
} satisfies Command;