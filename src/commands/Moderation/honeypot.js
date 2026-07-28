import { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getHoneypotConfig, setHoneypotConfig, buildHoneypotWarningEmbed, buildHoneypotComponents, refreshHoneypotMessage } from '../../services/honeypotService.js';

export default {
    category: 'Moderation',

    data: new SlashCommandBuilder()
        .setName('honeypot')
        .setDescription('Manage the honeypot channel that auto-bans/kicks anyone who sends a message in it')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

        .addSubcommand((sub) =>
            sub
                .setName('set')
                .setDescription('Set the honeypot channel and post the warning embed')
                .addChannelOption((opt) =>
                    opt.setName('channel').setDescription('The channel to use as a honeypot').setRequired(true),
                ),
        )

        .addSubcommand((sub) =>
            sub
                .setName('method')
                .setDescription('Toggle between ban and kick for honeypot punishment')
                .addStringOption((opt) =>
                    opt
                        .setName('action')
                        .setDescription('Punishment to apply when triggered')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Ban (default)', value: 'ban' },
                            { name: 'Kick', value: 'kick' },
                        ),
                ),
        )

        .addSubcommand((sub) =>
            sub.setName('disable').setDescription('Disable the honeypot without deleting the channel'),
        )

        .addSubcommand((sub) =>
            sub.setName('status').setDescription('Show the current honeypot configuration'),
        ),

    async execute(interaction, config, client) {
        try {
            await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

            const sub = interaction.options.getSubcommand();
            const guild = interaction.guild;
            const guildId = guild.id;

            if (sub === 'set') {
                const channel = interaction.options.getChannel('channel');

                if (!channel.isTextBased()) {
                    throw new TitanBotError('Invalid channel type', ErrorTypes.VALIDATION, 'The honeypot channel must be a text channel.');
                }

                const botMember = guild.members.me;
                const perms = channel.permissionsFor(botMember);
                if (!perms?.has('ViewChannel') || !perms?.has('ManageMessages')) {
                    throw new TitanBotError('Missing permissions', ErrorTypes.PERMISSION, `I need **View Channel** and **Manage Messages** permissions in ${channel}.`);
                }

                const existing = await getHoneypotConfig(guildId);
                const banCount = existing.banCount || 0;
                const method = existing.method || 'ban';

                let messageId = null;
                try {
                    const msg = await channel.send({
                        embeds: [buildHoneypotWarningEmbed(method)],
                        components: [buildHoneypotComponents(banCount, method)],
                    });
                    messageId = msg.id;
                } catch (err) {
                    logger.warn(`Honeypot: could not post warning embed in ${channel.id}:`, err);
                }

                await setHoneypotConfig(guildId, { channelId: channel.id, enabled: true, banCount, method, messageId });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        createEmbed({
                            title: 'Honeypot Set',
                            description:
                                `${channel} is now the honeypot channel.\n\n` +
                                `Anyone who sends a message there will be **instantly ${method === 'kick' ? 'kicked' : 'banned'}**.\n\n` +
                                `The warning embed has been posted in the channel.`,
                            color: 'success',
                        }),
                    ],
                });

                } else if (sub === 'method') {
                    const owners = (process.env.OWNER_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
                    if (!owners.includes(interaction.user.id)) {
                        throw new TitanBotError('Not bot owner', ErrorTypes.PERMISSION, 'Only the bot owner can change the honeypot method.');
                    }
                
                    const action = interaction.options.getString('action');
                    const current = await getHoneypotConfig(guildId);
                
                    if (!current.channelId || !current.enabled) {
                        throw new TitanBotError('Not configured', ErrorTypes.VALIDATION, 'Set up a honeypot channel first with `/honeypot set`.');
                    }

                await setHoneypotConfig(guildId, { ...current, method: action });
                await refreshHoneypotMessage(client, guildId);

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        createEmbed({
                            title: 'Honeypot Method Updated',
                            description: `The honeypot will now **${action}** users who send messages in the protected channel.\n\nThe warning embed has been updated.`,
                            color: action === 'kick' ? 'warning' : 'error',
                        }),
                    ],
                });

            } else if (sub === 'disable') {
                const current = await getHoneypotConfig(guildId);
                if (!current.channelId || !current.enabled) {
                    throw new TitanBotError('Not configured', ErrorTypes.VALIDATION, 'The honeypot is not currently enabled on this server.');
                }

                await setHoneypotConfig(guildId, { ...current, enabled: false });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        createEmbed({
                            title: 'Honeypot Disabled',
                            description: 'The honeypot has been disabled. The channel still exists but messages will no longer trigger any action.',
                            color: 'warning',
                        }),
                    ],
                });

            } else if (sub === 'status') {
                const current = await getHoneypotConfig(guildId);
                const method = current.method || 'ban';

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        createEmbed({
                            title: 'Honeypot Status',
                            description: null,
                        }).addFields(
                            { name: 'Enabled', value: current.enabled ? 'Yes' : 'No', inline: true },
                            { name: 'Channel', value: current.channelId ? `<#${current.channelId}>` : 'Not set', inline: true },
                            { name: 'Method', value: method.charAt(0).toUpperCase() + method.slice(1), inline: true },
                            { name: 'Total Actions', value: `${current.banCount || 0}`, inline: true },
                        ),
                    ],
                });
            }
        } catch (error) {
            await handleInteractionError(interaction, error, { command: 'honeypot' });
        }
    },
};
