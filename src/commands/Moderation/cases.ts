import type { Command } from '../../types/index.js';
import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { getModerationCases } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
export default {
    data: new SlashCommandBuilder()
        .setName('cases')
        .setDescription('Moderationsfälle und Audit-Logs ansehen')
        .setDefaultMemberPermissions(PermissionFlagsBits.ViewAuditLog)
        .setDMPermission(false)
        .addStringOption(option =>
            option.setName('filter')
                .setDescription('Fälle nach Typ oder Nutzer filtern')
                .addChoices(
                    { name: 'Alle Fälle', value: 'all' },
                    { name: 'Banns', value: 'Member Banned' },
                    { name: 'Kicks', value: 'Member Kicked' },
                    { name: 'Timeouts', value: 'Member Timed Out' },
                    { name: 'Verwarnungen', value: 'User Warned' }
                )
        )
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Fälle nach einem bestimmten Nutzer filtern')
        )
        .addIntegerOption(option =>
            option.setName('limit')
                .setDescription('Anzahl der angezeigten Fälle (Standard: 10)')
                .setMinValue(1)
                .setMaxValue(50)
        ),

    category: 'moderation',

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Cases interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'cases'
            });
            return;
        }

        try {
            const filterType = interaction.options.getString('filter') || 'all';
            const targetUser = interaction.options.getUser('user');
            const limit = interaction.options.getInteger('limit') || 10;

            const filters = {
                limit,
                action: filterType === 'all' ? undefined : filterType,
                userId: targetUser?.id
            };

            const cases = await getModerationCases(interaction.guild!.id, filters);

            if (cases.length === 0) {
                throw new Error(targetUser 
                    ? `No moderation cases found for ${targetUser.tag}`
                    : `No ${filterType === 'all' ? '' : filterType} cases found in this server.`
                );
            }

            const CASES_PER_PAGE = 5;
            const totalPages = Math.ceil(cases.length / CASES_PER_PAGE);
            let currentPage = 1;

            const createCasesEmbed = (page: number) => {
                const startIndex = (page - 1) * CASES_PER_PAGE;
                const endIndex = startIndex + CASES_PER_PAGE;
                const pageCases = cases.slice(startIndex, endIndex);

                const embed = createEmbed({
                    title: 'Moderationsfälle',
                    description: `Moderationsfälle für **${interaction.guild!.name}**\n\n**Seite ${page} von ${totalPages}**`
                });

                pageCases.forEach(case_ => {
                    const date = new Date(case_.createdAt).toLocaleDateString();
                    const time = new Date(case_.createdAt).toLocaleTimeString();
                    
                    embed.addFields({
                        name: `Fall #${case_.caseId} - ${case_.action}`,
                        value: `**Ziel:** ${case_.target}\n**Moderator:** ${case_.executor}\n**Datum:** ${date} um ${time}\n**Grund:** ${case_.reason || 'Kein Grund angegeben'}`,
                        inline: false
                    });
                });

                embed.setFooter({
                    text: `Fälle gesamt: ${cases.length} | Filter: ${filterType}${targetUser ?` | Nutzer: ${targetUser.tag}`: ''}`
                });

                return embed;
            };

            const createNavigationRow = (page: number) => {
                const row = new ActionRowBuilder<ButtonBuilder>();
                
                const prevButton = new ButtonBuilder()
                    .setCustomId('prev_page')
                    .setLabel('⬅️ Vorherige')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 1);

                const pageInfoButton = new ButtonBuilder()
                    .setCustomId('page_info')
                    .setLabel(`Seite ${page}/${totalPages}`)
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true);

                const nextButton = new ButtonBuilder()
                    .setCustomId('next_page')
                    .setLabel('Weiter ➡️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === totalPages);

                row.addComponents(prevButton, pageInfoButton, nextButton);
                return row;
            };

            const message = await interaction.editReply({ 
                embeds: [createCasesEmbed(currentPage)], 
                components: [createNavigationRow(currentPage)]
            });

            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
time: 120000
            });

            collector.on('collect', async (buttonInteraction) => {
                await buttonInteraction.deferUpdate();

                if (buttonInteraction.user.id !== interaction.user.id) {
                    await buttonInteraction.followUp({
                        content: 'Du kannst diese Buttons nicht nutzen. Nutze `/cases`, um deine eigene Fallansicht zu öffnen.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const { customId } = buttonInteraction;

                if (customId === 'prev_page' && currentPage > 1) {
                    currentPage--;
                } else if (customId === 'next_page' && currentPage < totalPages) {
                    currentPage++;
                }

                await interaction.editReply({
                    embeds: [createCasesEmbed(currentPage)],
                    components: [createNavigationRow(currentPage)]
                });
            });

            collector.on('end', async () => {
                const disabledRow = createNavigationRow(currentPage);
                disabledRow.components.forEach(button => button.setDisabled(true));
                
                try {
                    await message.edit({
                        components: [disabledRow]
                    });
                } catch (error) {
                }
            });

        } catch (error) {
            logger.error('Error in cases command:', error);
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Laden der Moderationsfälle ist ein Fehler aufgetreten. Bitte versuch es später noch einmal.' });
        }
    }
} satisfies Command;