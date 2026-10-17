import { getColor } from '../../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { getWelcomeConfig, updateWelcomeConfig } from '../../../utils/database.js';
import { formatWelcomeMessage, truncateForEmbedField } from '../../../utils/welcome.js';
import { logger } from '../../../utils/logger.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import type { Command } from '../../../types/index.js';
import type { WelcomeEmbedConfig } from '../../../utils/database.js';

export default {
    data: new SlashCommandBuilder()
        .setName('goodbye')
        .setDescription('Das Abschiedssystem konfigurieren')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Die Abschiedsnachricht einrichten')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Der Kanal für Abschiedsnachrichten')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('Abschiedsnachricht. Variablen: {user}, {username}, {server}, {memberCount}')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('image')
                        .setDescription('URL des Bildes für die Abschiedsnachricht')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('ping')
                        .setDescription('Ob der Nutzer in der Abschiedsnachricht gepingt wird')
                        .setRequired(false))),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Goodbye interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'goodbye'
            });
            return;
        }

        const { options, guild, client } = interaction as ChatInputCommandInteraction<'cached'>;

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Du brauchst die Berechtigung **Server verwalten**, um `/welcome goodbye` zu nutzen.' });
        }

        const subcommand = options.getSubcommand();

        if (subcommand === 'setup') {
            const channel = options.getChannel('channel')!;
            const message = options.getString('message');
            const image = options.getString('image');
            const ping = options.getBoolean('ping') ?? false;

            const existingConfig = await getWelcomeConfig(client, guild.id);
            if (existingConfig?.goodbyeChannelId) {
                logger.info(`[Goodbye] Setup blocked because config already exists in channel ${existingConfig.goodbyeChannelId} for guild ${guild.id}`);
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Abschied ist bereits für <#${existingConfig.goodbyeChannelId}> eingerichtet. Nutze **/welcome greet dashboard**, um Kanal, Nachricht, Ping oder Bild anzupassen.` });
            }

            if (!message || message.trim().length === 0) {
                logger.warn(`[Goodbye] Empty message provided by ${interaction.user.tag} in ${guild.name}`);
                return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Die Abschiedsnachricht darf nicht leer sein.' });
            }

            if (image) {
                try {
                    new URL(image);
                } catch (e) {
                    logger.warn(`[Goodbye] Invalid image URL provided by ${interaction.user.tag}: ${image}`);
                    return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Bitte gib eine gültige Bild-URL an (muss mit http:// oder https:// beginnen).' });
                }
            }

            try {
                await updateWelcomeConfig(client, guild.id, {
                    goodbyeEnabled: true,
                    goodbyeChannelId: channel.id,
                    leaveMessage: message,
                    goodbyePing: ping,
                    // Stored color is numeric (getColor); WelcomeEmbedConfig.color is typed string-only.
                    leaveEmbed: {
                        title: "Tschüss {user.tag}",
                        description: message,
                        color: getColor('error'),
                        footer: `Tschüss von ${guild.name}!`,
                        ...(image && { image: { url: image } })
                    } as Record<string, unknown> as WelcomeEmbedConfig
                });

                logger.info(`[Goodbye] Setup configured by ${interaction.user.tag} for guild ${guild.name} (${guild.id})`);

                const previewMessage = formatWelcomeMessage(message, {
                    user: interaction.user,
                    guild
                });

                const embed = new EmbedBuilder()
                    .setColor(getColor('success'))
                    .setTitle('Abschiedssystem eingerichtet')
                    .setDescription(`Abschiedsnachrichten werden jetzt in ${channel} gesendet.`)
                    .addFields(
                        { name: 'Nachrichtenvorschau', value: truncateForEmbedField(previewMessage) },
                        { name: 'Nutzer pingen', value: ping ? 'Ja' : 'Nein' },
                        { name: 'Status', value: 'Aktiviert' }
                    )
                    .setFooter({ text: 'Tipp: Mit /welcome greet dashboard passt du die Abschiedseinstellungen an' });

                if (image) {
                    embed.setImage(image);
                }

                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            } catch (error) {
                logger.error(`[Goodbye] Failed to setup goodbye system for guild ${guild.id}:`, error);
                await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Einrichten des Abschiedssystems ist ein Fehler aufgetreten. Bitte versuch es erneut.' });
            }
        }
    },
} satisfies Command;
