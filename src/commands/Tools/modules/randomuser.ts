import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, type ColorResolvable, type MessageComponentInteraction } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import { getColor } from '../../../config/bot.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import type { Command } from '../../../types/index.js';

export default {
    data: new SlashCommandBuilder()
        .setName('randomuser')
        .setDescription('Wählt einen zufälligen Nutzer vom Server aus')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Nur Nutzer mit dieser Rolle berücksichtigen')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('bots')
                .setDescription('Bots einbeziehen (Standard: nein)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('online')
                .setDescription('Nur Nutzer, die online sind (Standard: nein)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('mention')
                .setDescription('Ausgewählten Nutzer erwähnen (Standard: nein)')
                .setRequired(false)),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`RandomUser interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'randomuser'
            });
            return;
        }

        if (!interaction.guild) {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Dieser Command kann nur auf einem Server genutzt werden.',
            });
        }

        const role = interaction.options.getRole('role');
        const includeBots = interaction.options.getBoolean('bots') || false;
        const onlineOnly = interaction.options.getBoolean('online') || false;
        const shouldMention = interaction.options.getBoolean('mention') || false;

        let members = interaction.guild.members.cache.filter(member => {
            if (member.user.bot && !includeBots) return false;

            if (onlineOnly && member.presence?.status === 'offline') return false;

            if (role && !member.roles.cache.has(role.id)) return false;

            return true;
        });

        let memberArray = Array.from(members.values());

        if (!includeBots) {
            memberArray = memberArray.filter(member => !member.user.bot);
        }

        if (memberArray.length === 0) {
            let errorMessage = 'Es wurden keine Nutzer gefunden, die zu deinen Filtern passen.';
            if (role) errorMessage = `Kein Nutzer hat die Rolle **${role.name}**.`;
            if (onlineOnly) errorMessage = 'Gerade ist kein Nutzer online.';
            if (role && onlineOnly) errorMessage = `Kein Mitglied mit der Rolle **${role.name}** ist online.`;

            return replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: errorMessage + '\n\nVersuch, deine Filter anzupassen.',
            });
        }

        const randomIndex = Math.floor(Math.random() * memberArray.length);
        const selectedMember = memberArray[randomIndex];

        const user = selectedMember.user;
        const joinDate = selectedMember.joinedAt;
        const roles = selectedMember.roles.cache
            .filter(role => role.id !== interaction.guild!.id)
            .sort((a, b) => b.position - a.position)
            .map(role => role.toString())
            .slice(0, 10);

        const embed = successEmbed(
            '🎲 Zufälliger Nutzer ausgewählt',
            shouldMention ? `${selectedMember}` : `**${user.username}**`
        )
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .addFields(
            { name: 'Nutzername', value: user.username, inline: true },
            { name: 'Bot', value: user.bot ? 'Ja' : 'Nein', inline: true },
            { name: `Rollen (${roles.length})`, value: roles.length > 0 ? roles.slice(0, 5).join('') + (roles.length > 5 ? `+${roles.length - 5} weitere` : '') : 'Keine Rollen', inline: false }
        )
        // NOTE: 'primary' is not a valid ColorResolvable (discord.js throws ColorConvert); kept as-is from JS
        .setColor('primary' as ColorResolvable);

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`randomuser_${interaction.user.id}_again`)
                    .setLabel('🎲 Anderen Nutzer wählen')
                    .setStyle(ButtonStyle.Primary)
            );

        const response = await interaction.editReply({
            content: shouldMention ? `${selectedMember}, du wurdest ausgewählt!` : null,
            embeds: [embed],
            components: [row],
            allowedMentions: { users: shouldMention ? [user.id] : [] }
        });

        const filter = (i: MessageComponentInteraction) => i.customId === `randomuser_${interaction.user.id}_again` && i.user.id === interaction.user.id;
        const collector = response.createMessageComponentCollector({ filter, time: 300000 });

        collector.on('collect', async (i) => {
            try {
                let newMembers = interaction.guild!.members.cache.filter(member => {
                    if (member.user.bot && !includeBots) return false;

                    if (onlineOnly && member.presence?.status === 'offline') return false;

                    if (role && !member.roles.cache.has(role.id)) return false;

                    return true;
                });

                let newMemberArray = Array.from(newMembers.values());

                if (!includeBots) {
                    newMemberArray = newMemberArray.filter(member => !member.user.bot);
                }

                if (newMemberArray.length === 0) {
                    await replyUserError(i, {
                        type: ErrorTypes.USER_INPUT,
                        message: 'Keine Nutzer gefunden, die zu den Kriterien passen.',
                    });
                    return;
                }

                const newRandomIndex = Math.floor(Math.random() * newMemberArray.length);
                const newSelectedMember = newMemberArray[newRandomIndex];
                const newUser = newSelectedMember.user;

                const newRoles = newSelectedMember.roles.cache
                    .filter(r => r.id !== interaction.guild!.id)
                    .sort((a, b) => b.position - a.position)
                    .map(r => r.toString())
                    .slice(0, 10);

                const newEmbed = successEmbed(
                    '🎲 Zufälliger Nutzer ausgewählt',
                    shouldMention ? `${newSelectedMember}` : `**${newUser.username}**`
                )
                .setThumbnail(newUser.displayAvatarURL({ size: 256 }))
                .addFields(
                    { name: 'Nutzername', value: newUser.username, inline: true },
                    { name: 'Bot', value: newUser.bot ? 'Ja' : 'Nein', inline: true },
                    { name: `Rollen (${newRoles.length})`, value: newRoles.length > 0 ? newRoles.slice(0, 5).join('') + (newRoles.length > 5 ? `+${newRoles.length - 5} weitere` : '') : 'Keine Rollen', inline: false }
                )
                .setColor(newSelectedMember.displayHexColor || '#3498db');

                await i.update({
                    content: shouldMention ? `${newSelectedMember}, du wurdest ausgewählt!` : null,
                    embeds: [newEmbed],
                    components: [row],
                    allowedMentions: { users: shouldMention ? [newUser.id] : [] }
                });

            } catch (error) {
                logger.error('Button interaction error:', error);
                await i.reply({
                    content: 'Beim Auswählen eines anderen Nutzers ist ein Fehler aufgetreten.',
                    flags: ['Ephemeral']
                });
            }
        });

        collector.on('end', () => {
            const disabledRow = ActionRowBuilder.from<ButtonBuilder>(row).setComponents(
                ButtonBuilder.from(row.components[0]).setDisabled(true)
            );

            interaction.editReply({ components: [disabledRow] }).catch(console.error);
        });
    },
} satisfies Command;