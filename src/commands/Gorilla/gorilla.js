import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } from 'discord.js';
import { errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { fetchGorillaStatus, buildStatusEmbed, fetchPatchNotes, buildPatchEmbed } from '../../services/gorillaService.js';

const COSMETICS = [
    { name: 'Top Hat',          category: 'Hat',      emoji: '🎩', description: 'A classy top hat for the distinguished gorilla.' },
    { name: 'Cowboy Hat',       category: 'Hat',      emoji: '🤠', description: 'Yeehaw, partner.' },
    { name: 'Birthday Hat',     category: 'Hat',      emoji: '🎂', description: 'Happy birthday! Available during anniversary events.' },
    { name: 'Santa Hat',        category: 'Hat',      emoji: '🎅', description: 'Ho ho ho. A festive seasonal item.' },
    { name: 'Pumpkin',          category: 'Hat',      emoji: '🎃', description: 'Spooky season never ends.' },
    { name: 'Crown',            category: 'Hat',      emoji: '👑', description: 'For the royalty among gorillas.' },
    { name: 'Antlers',          category: 'Hat',      emoji: '🦌', description: 'Jingle all the way.' },
    { name: 'Party Hat',        category: 'Hat',      emoji: '🎉', description: 'Always ready to party.' },
    { name: 'Banana',           category: 'Hat',      emoji: '🍌', description: 'Monke food, worn as a hat.' },
    { name: 'Pirate Hat',       category: 'Hat',      emoji: '🏴‍☠️', description: 'Arrr matey, walk the plank.' },
    { name: 'Wizard Hat',       category: 'Hat',      emoji: '🪄', description: 'You shall not pass.' },
    { name: 'Chef Hat',         category: 'Hat',      emoji: '👨‍🍳', description: 'Cooking up a storm in the trees.' },
    { name: 'Graduation Cap',   category: 'Hat',      emoji: '🎓', description: 'The most educated gorilla around.' },
    { name: 'Flower Crown',     category: 'Hat',      emoji: '🌸', description: 'Beautiful and in full bloom.' },
    { name: 'Propeller Hat',    category: 'Hat',      emoji: '🌀', description: 'Spin to win.' },
    { name: 'Space Helmet',     category: 'Hat',      emoji: '🚀', description: 'One giant leap for gorillakind.' },
    { name: 'Hard Hat',         category: 'Hat',      emoji: '🦺', description: 'Safety first, even in the jungle.' },
    { name: 'Cat Ears',         category: 'Hat',      emoji: '🐱', description: 'Meow.' },
    { name: 'Fox Ears',         category: 'Hat',      emoji: '🦊', description: 'Sneaky and stylish.' },
    { name: 'Viking Helmet',    category: 'Hat',      emoji: '⚔️', description: 'Pillage the forest.' },
    { name: 'Rainbow Mohawk',   category: 'Hat',      emoji: '🌈', description: 'Very colourful, very aerodynamic.' },
    { name: 'Duck Hat',         category: 'Hat',      emoji: '🦆', description: 'Quack.' },
    { name: 'Headphones',       category: 'Hat',      emoji: '🎧', description: 'Vibe while you climb.' },
    { name: 'Halo',             category: 'Hat',      emoji: '😇', description: 'An angelic gorilla.' },
    { name: 'Devil Horns',      category: 'Hat',      emoji: '😈', description: 'The dark side of the jungle.' },
    { name: 'Sunflower',        category: 'Hat',      emoji: '🌻', description: 'Blooming lovely.' },
    { name: 'Mod Stick',        category: 'Badge',    emoji: '🔨', description: 'Held by Gorilla Tag moderators.' },
    { name: 'Dev Badge',        category: 'Badge',    emoji: '🛠️', description: 'Exclusive to the developers of Gorilla Tag.' },
    { name: 'Donor Badge',      category: 'Badge',    emoji: '💎', description: 'For supporters of the game.' },
    { name: 'Left Shark',       category: 'Costume',  emoji: '🦈', description: 'You know the one.' },
    { name: 'Ghost',            category: 'Costume',  emoji: '👻', description: 'Spooky scary.' },
    { name: 'Banana Suit',      category: 'Costume',  emoji: '🍌', description: 'Full banana mode activated.' },
    { name: 'Astronaut Suit',   category: 'Costume',  emoji: '👨‍🚀', description: 'To infinity and beyond.' },
    { name: 'Candy Corn',       category: 'Hat',      emoji: '🍬', description: 'Sweet Halloween treat.' },
    { name: 'Elf Hat',          category: 'Hat',      emoji: '🧝', description: 'Helper of Santa Gorilla.' },
];

export default {
    data: new SlashCommandBuilder()
        .setName('gorilla')
        .setDescription('Gorilla Tag tools')
        .addSubcommand(s => s
            .setName('setup')
            .setDescription('Create a server-status channel for Gorilla Tag and start auto-updates')
            .addChannelOption(o => o
                .setName('category')
                .setDescription('Category to create the channel in (optional)')
                .addChannelTypes(ChannelType.GuildCategory)
            )
        )
        .addSubcommand(s => s
            .setName('status')
            .setDescription('Check Gorilla Tag server status right now')
        )
        .addSubcommand(s => s
            .setName('patchnotes')
            .setDescription('Show the latest Gorilla Tag patch notes')
            .addIntegerOption(o => o
                .setName('count')
                .setDescription('How many updates to show (1-5, default 1)')
                .setMinValue(1)
                .setMaxValue(5)
            )
        )
        .addSubcommand(s => s
            .setName('cosmetics')
            .setDescription('Browse Gorilla Tag cosmetics')
            .addStringOption(o => o
                .setName('search')
                .setDescription('Search by name or category (Hat, Badge, Costume)')
            )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    category: 'Gorilla',

    async execute(interaction, _guildConfig, client) {
        try {
            const sub = interaction.options.getSubcommand();

            if (sub === 'status') {
                await InteractionHelper.safeDefer(interaction);
                const status = await fetchGorillaStatus();
                return InteractionHelper.safeEditReply(interaction, { embeds: [buildStatusEmbed(status)] });
            }

            if (sub === 'patchnotes') {
                await InteractionHelper.safeDefer(interaction);
                const count = interaction.options.getInteger('count') ?? 1;
                const notes = await fetchPatchNotes(count);
                if (!notes.length) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('No Results', 'Could not fetch patch notes from Steam.')],
                    });
                }
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: notes.map(buildPatchEmbed),
                });
            }

            if (sub === 'cosmetics') {
                const query = interaction.options.getString('search')?.toLowerCase() ?? '';
                const filtered = query
                    ? COSMETICS.filter(c => c.name.toLowerCase().includes(query) || c.category.toLowerCase().includes(query))
                    : COSMETICS;

                if (!filtered.length) {
                    return InteractionHelper.safeReply(interaction, {
                        embeds: [errorEmbed('No Results', `No cosmetics found for \`${query}\``)],
                        ephemeral: true,
                    });
                }

                const lines = filtered.slice(0, 20).map(c =>
                    `${c.emoji} **${c.name}** \`${c.category}\`\n┗ ${c.description}`
                );

                const embed = new EmbedBuilder()
                    .setColor(0x8B4513)
                    .setTitle('🦍 Gorilla Tag Cosmetics')
                    .setDescription(lines.join('\n\n'))
                    .setFooter({ text: `${filtered.length} result(s)${filtered.length > 20 ? ' — showing first 20' : ''}` });

                return InteractionHelper.safeReply(interaction, { embeds: [embed] });
            }

            if (sub === 'setup') {
                await InteractionHelper.safeDefer(interaction, { ephemeral: true });

                const existing = await client.db.get(`gorilla:${interaction.guildId}`);
                if (existing?.channelId) {
                    const ch = await interaction.guild.channels.fetch(existing.channelId).catch(() => null);
                    if (ch) {
                        return InteractionHelper.safeEditReply(interaction, {
                            embeds: [errorEmbed('Already Set Up', `Status channel is already <#${ch.id}>. Delete it first to reset.`)],
                        });
                    }
                }

                const category = interaction.options.getChannel('category') ?? null;

                const channel = await interaction.guild.channels.create({
                    name: '🦍・server-status',
                    type: ChannelType.GuildText,
                    parent: category?.id ?? null,
                    topic: 'Gorilla Tag server status — auto-updated every 5 minutes',
                    permissionOverwrites: [
                        {
                            id: interaction.guild.roles.everyone.id,
                            allow: ['ViewChannel'],
                            deny: ['SendMessages'],
                        },
                        {
                            id: interaction.guild.members.me.id,
                            allow: ['SendMessages', 'ViewChannel', 'EmbedLinks'],
                        },
                    ],
                });

                const status = await fetchGorillaStatus();
                const msg = await channel.send({ embeds: [buildStatusEmbed(status)] });

                await client.db.set(`gorilla:${interaction.guildId}`, {
                    channelId: channel.id,
                    messageId: msg.id,
                    lastIndicator: status.indicator,
                });

                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [new EmbedBuilder()
                        .setColor(0x57F287)
                        .setTitle('✅ Gorilla Tag Status Set Up')
                        .setDescription(`Created ${channel} — status will auto-update every 5 minutes.`)
                        .setTimestamp()],
                });
            }
        } catch (error) {
            await handleInteractionError(interaction, error, { commandName: 'gorilla' });
        }
    },
};
