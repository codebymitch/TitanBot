import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { handlePanelAdd, handlePanelList, handlePanelDelete } from './modules/ticket_panels.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("Manages the server's ticket panels.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)

        .addSubcommandGroup((group) =>
            group
                .setName("panel")
                .setDescription("Manage ticket panels")

                .addSubcommand((sub) =>
                    sub.setName("add")
                        .setDescription("Create a new ticket panel in a channel")
                        .addChannelOption((opt) =>
                            opt.setName("panel_channel")
                                .setDescription("Channel to post the panel in")
                                .addChannelTypes(ChannelType.GuildText)
                                .setRequired(true),
                        )
                        .addStringOption((opt) =>
                            opt.setName("panel_message")
                                .setDescription("Description shown on the panel")
                                .setRequired(true),
                        )
                        .addStringOption((opt) =>
                            opt.setName("panel_title")
                                .setDescription("Title of the panel embed (default: Support Tickets)")
                                .setRequired(false),
                        )
                        .addStringOption((opt) =>
                            opt.setName("button_label")
                                .setDescription("Label on the create ticket button (default: Create Ticket)")
                                .setRequired(false),
                        )
                        .addChannelOption((opt) =>
                            opt.setName("category")
                                .setDescription("Category where tickets from this panel will be created")
                                .addChannelTypes(ChannelType.GuildCategory)
                                .setRequired(false),
                        )
                        .addChannelOption((opt) =>
                            opt.setName("closed_category")
                                .setDescription("Category where closed tickets from this panel will go")
                                .addChannelTypes(ChannelType.GuildCategory)
                                .setRequired(false),
                        )
                        .addRoleOption((opt) =>
                            opt.setName("staff_role")
                                .setDescription("Staff role that can access tickets from this panel")
                                .setRequired(false),
                        )
                        .addIntegerOption((opt) =>
                            opt.setName("max_tickets_per_user")
                                .setDescription("Max open tickets per user for this panel (default: 3)")
                                .setMinValue(1)
                                .setMaxValue(10)
                                .setRequired(false),
                        )
                        .addBooleanOption((opt) =>
                            opt.setName("dm_on_close")
                                .setDescription("DM user when ticket closed (default: true)")
                                .setRequired(false),
                        ),
                )

                .addSubcommand((sub) =>
                    sub.setName("list")
                        .setDescription("List all ticket panels for this server"),
                )

                .addSubcommand((sub) =>
                    sub.setName("delete")
                        .setDescription("Delete a ticket panel")
                        .addStringOption((opt) =>
                            opt.setName("panel_id")
                                .setDescription("The panel ID to delete (get from /ticket panel list)")
                                .setRequired(true),
                        ),
                ),
        )

        .addSubcommand((sub) =>
            sub.setName("transcript")
                .setDescription("Set the channel where ticket transcripts are sent")
                .addChannelOption((opt) =>
                    opt.setName("channel")
                        .setDescription("The channel to send transcripts to")
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                ),
        ),

    category: "ticket",

    async execute(interaction, config, client) {
        try {
            const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferred) return;

            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
                return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need the `Manage Channels` permission for this action.' });
            }

            const subcommand = interaction.options.getSubcommand();
            const subcommandGroup = interaction.options.getSubcommandGroup(false);

            if (subcommandGroup === 'panel') {
                if (subcommand === 'add') return await handlePanelAdd(interaction, client);
                if (subcommand === 'list') return await handlePanelList(interaction, client);
                if (subcommand === 'delete') return await handlePanelDelete(interaction, client);
            }

            if (subcommand === 'transcript') {
                const channel = interaction.options.getChannel('channel');
                const { getGuildConfig } = await import('../../services/guildConfig.js');
                const { getGuildConfigKey } = await import('../../utils/database.js');
                const guildConfig = await getGuildConfig(client, interaction.guildId);
                guildConfig.ticketTranscriptChannelId = channel.id;
                await client.db.set(getGuildConfigKey(interaction.guildId), guildConfig);
                const { successEmbed } = await import('../../utils/embeds.js');
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed('✅ Transcript Channel Set', `Ticket transcripts will be sent to ${channel}.`)],
                });
            }
        } catch (error) {
            logger.error('Error executing ticket command', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'ticket'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'ticket',
                source: 'ticket_command_main'
            });
        }
    }
};
