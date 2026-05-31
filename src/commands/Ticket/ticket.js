```js
import { getColor } from '../../config/bot.js';
import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} from 'discord.js';

import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

import ticketConfig from './modules/ticket_dashboard.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("Manages the server's ticket system.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)

        .addSubcommand((subcommand) =>
            subcommand
                .setName("setup")
                .setDescription("Sets up the ticket panel")

                .addChannelOption(option =>
                    option.setName("panel_channel")
                        .setDescription("Channel for the panel")
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )

                .addStringOption(option =>
                    option.setName("panel_message")
                        .setDescription("Message for the panel")
                        .setRequired(true)
                )

                .addStringOption(option =>
                    option.setName("button_label")
                        .setDescription("Button label")
                        .setRequired(false)
                )

                .addChannelOption(option =>
                    option.setName("category")
                        .setDescription("Ticket category")
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false)
                )
        )

        .addSubcommand((subcommand) =>
            subcommand
                .setName("dashboard")
                .setDescription("Open dashboard")
        ),

    category: "ticket",

    async execute(interaction, config, client) {
        try {
            const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferred) return;

            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Permission Denied",
                            "You need Manage Channels permission."
                        )
                    ]
                });
            }

            const subcommand = interaction.options.getSubcommand();

            if (subcommand === "dashboard") {
                return ticketConfig.execute(interaction, config, client);
            }

            if (subcommand === "setup") {

                const existingConfig = await getGuildConfig(client, interaction.guildId);

                if (existingConfig?.ticketPanelChannelId) {
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            errorEmbed(
                                "Already Setup",
                                `Panel already exists in <#${existingConfig.ticketPanelChannelId}>`
                            )
                        ]
                    });
                }

                const panelChannel = interaction.options.getChannel("panel_channel");
                const categoryChannel = interaction.options.getChannel("category");

                const panelMessage = interaction.options.getString("panel_message");
                const buttonLabel = interaction.options.getString("button_label") || "Create Ticket";

                const embed = createEmbed({
                    title: "🎫 Support Tickets",
                    description: panelMessage,
                    color: getColor('info')
                });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("create_ticket")
                        .setLabel(buttonLabel)
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji("📩")
                );

                await panelChannel.send({
                    embeds: [embed],
                    components: [row]
                });

                if (client.db) {
                    const currentConfig = existingConfig || {};

                    currentConfig.ticketCategoryId = categoryChannel ? categoryChannel.id : null;
                    currentConfig.ticketPanelChannelId = panelChannel.id;
                    currentConfig.ticketPanelMessage = panelMessage;

                    const { getGuildConfigKey } = await import('../../utils/database.js');
                    const key = getGuildConfigKey(interaction.guildId);

                    await client.db.set(key, currentConfig);
                }

                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed(
                            "Setup Complete",
                            `Panel sent to ${panelChannel}`
                        )
                    ]
                });
            }

        } catch (error) {
            logger.error('Ticket command error', {
                error: error.message,
                stack: error.stack
            });

            await handleInteractionError(interaction, error);
        }
    }
};
```

