import type { Command } from '../../../types/index.js';
import { getColor } from '../../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed } from '../../../utils/embeds.js';
import { logEvent } from '../../../utils/moderation.js';
import { logger } from '../../../utils/logger.js';
import { WarningService } from '../../../services/moderation/warningService.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("warnings")
        .setDescription("Alle Verwarnungen eines Nutzers ansehen")
        .addUserOption((o) =>
            o
                .setName("target")
                .setRequired(true)
                .setDescription("Nutzer, dessen Verwarnungen du sehen willst"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Warnings interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'warnings',
            });
            return;
        }

        const target = interaction.options.getUser("target")!;
        const guildId = interaction.guildId!;

        const validWarnings = await WarningService.getWarnings(guildId, target.id);
        const totalWarns = validWarnings.length;

        if (totalWarns === 0) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    createEmbed({
                        title: `Verwarnungen: ${target.tag}`,
                        description: "Dieser Nutzer hat keine Verwarnungen.",
                    }).setColor(getColor('success')),
                ],
            });
            return;
        }

        const embed = createEmbed({
            title: `Verwarnungen: ${target.tag}`,
            description: `Verwarnungen gesamt: **${totalWarns}**`,
        }).setColor(getColor('warning'));

        const warningFields = validWarnings
            .map((w, i) => {
                const discordTimestamp = Math.floor(w.timestamp / 1000);
                return {
                    name: `[#${i + 1}] Grund: ${w.reason.substring(0, 100)}`,
                    value: `**Moderator:** <@${w.moderatorId}>\n**Datum:** <t:${discordTimestamp}:F> (<t:${discordTimestamp}:R>)`,
                    inline: false,
                };
            })
            .slice(0, 25);

        embed.addFields(warningFields);

        const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`warning_delete_specific:${target.id}:${interaction.user.id}`)
                .setLabel('Bestimmte Verwarnung löschen')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`warning_clear_all:${target.id}:${interaction.user.id}`)
                .setLabel('Alle Verwarnungen löschen')
                .setStyle(ButtonStyle.Danger),
        );

        await logEvent({
            client,
            guild: interaction.guild,
            event: {
                action: "Warnings Viewed",
                target: `${target.tag} (${target.id})`,
                executor: `${interaction.user.tag} (${interaction.user.id})`,
                reason: `${totalWarns} Verwarnungen angesehen`,
                metadata: {
                    userId: target.id,
                    moderatorId: interaction.user.id,
                    totalWarnings: totalWarns,
                },
            },
        });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components: [actionRow] });
    },
} satisfies Command;
