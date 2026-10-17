import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction, GuildTextBasedChannel } from 'discord.js';
import type { Command } from '../../../types/index.js';
import type { InteractionExtras } from '../../../utils/interactionHelper.js';

/** Prefix invocations arrive as a mock interaction carrying the message timestamp (see utils/messageAdapter). */
type PingInteraction = ChatInputCommandInteraction & InteractionExtras & { _commandStartTime?: number };
import { createEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Prüft die Latenz des Bots und die API-Geschwindigkeit"),

    async prefixExecute(interaction: PingInteraction) {
        try {
            const startTime = Date.now();
            const pingingMessage = await interaction.reply({ content: 'Pinge...' });

            const latency = Date.now() - startTime;
            const apiLatency = Math.max(0, Math.round(interaction.client.ws.ping));

            const embed = createEmbed({ title: 'Pong!', description: null }).addFields(
                { name: 'Bot-Latenz', value: `${latency}ms`, inline: true },
                { name: 'API-Latenz', value: `${apiLatency}ms`, inline: true },
            );

            await pingingMessage.edit({ content: null, embeds: [embed] });
        } catch (error) {
            logger.error('Ping prefix command error:', error);
            if (!interaction.replied && !interaction._replyMessage) {
                await (interaction.channel as GuildTextBasedChannel).send({
                    embeds: [createEmbed({ title: 'Systemfehler', description: 'Die Latenz konnte gerade nicht ermittelt werden.', color: 'error' })],
                }).catch(() => {});
            }
        }
    },

    async execute(interaction: PingInteraction) {
        logger.info('execute called - checking if slash command or prefix command');
        logger.info(`execute - has _commandStartTime: ${!!interaction._commandStartTime}, createdTimestamp: ${interaction.createdTimestamp}`);
        
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Ping interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'ping'
            });
            return;
        }

        try {
            await InteractionHelper.safeEditReply(interaction, {
                content: "Pinge...",
            });

            const startTime = interaction._commandStartTime || interaction.createdTimestamp;
            logger.info(`execute - using startTime: ${startTime}, type: ${interaction._commandStartTime ? 'prefix' : 'slash'}`);
            const latency = Math.max(0, Date.now() - startTime);
            const apiLatency = Math.max(0, Math.round(interaction.client.ws.ping));
            logger.info(`execute - calculated latency: ${latency}ms, apiLatency: ${apiLatency}ms`);

            const embed = createEmbed({ title: "Pong!", description: null }).addFields(
                { name: "Bot-Latenz", value: `${latency}ms`, inline: true },
                { name: "API-Latenz", value: `${apiLatency}ms`, inline: true },
            );

            await InteractionHelper.safeEditReply(interaction, {
                content: null,
                embeds: [embed],
            });
        } catch (error) {
            logger.error('Ping command error:', error);
            try {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [createEmbed({ title: 'Systemfehler', description: 'Die Latenz konnte gerade nicht ermittelt werden.', color: 'error' })],
                    flags: MessageFlags.Ephemeral,
                });
            } catch (replyError) {
                logger.error('Failed to send error reply:', replyError);
            }
        }
    },
} satisfies Command;