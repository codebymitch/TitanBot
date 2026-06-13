import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { successEmbed, errorEmbed, infoEmbed } from '../../utils/embeds.js';

export default {
    data: new SlashCommandBuilder()
        .setName('starboard')
        .setDescription('Pin popular messages to a dedicated starboard channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub => sub
            .setName('setup')
            .setDescription('Set up the starboard')
            .addChannelOption(o =>
                o.setName('channel')
                    .setDescription('Channel where starred messages will appear')
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(true)
            )
            .addIntegerOption(o =>
                o.setName('threshold')
                    .setDescription('Number of ⭐ reactions needed (default: 3)')
                    .setMinValue(1)
                    .setMaxValue(25)
            )
        )
        .addSubcommand(sub => sub.setName('disable').setDescription('Disable the starboard'))
        .addSubcommand(sub => sub.setName('view').setDescription('Show current starboard settings')),
    category: 'Utility',
    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const client = interaction.client;
        const key = `starboard:config:${interaction.guildId}`;

        if (sub === 'setup') {
            const channel = interaction.options.getChannel('channel');
            const threshold = interaction.options.getInteger('threshold') ?? 3;
            await client.db.set(key, { channelId: channel.id, threshold });
            return interaction.reply({
                embeds: [successEmbed('Starboard Enabled', `Starred messages will appear in ${channel}.\nStars required: **${threshold}** ⭐`)],
                ephemeral: true,
            });
        }

        if (sub === 'disable') {
            await client.db.del(key).catch(() => {});
            return interaction.reply({
                embeds: [successEmbed('Starboard Disabled', 'The starboard has been turned off.')],
                ephemeral: true,
            });
        }

        if (sub === 'view') {
            const config = await client.db.get(key).catch(() => null);
            if (!config) {
                return interaction.reply({
                    embeds: [infoEmbed('Starboard is not set up. Use `/starboard setup` to configure it.')],
                    ephemeral: true,
                });
            }
            return interaction.reply({
                embeds: [infoEmbed('Starboard Settings', `Channel: <#${config.channelId}>\nThreshold: **${config.threshold}** ⭐`)],
                ephemeral: true,
            });
        }
    },
};
