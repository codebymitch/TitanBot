import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Activity IDs for different Discord Activities
const ACTIVITIES = {
    'youtube': '880218394199220334',
    'poker': '755827207812677713',
    'chess': '832012774040141894',
    'checkers': '832013003968348200',
    'letter-league': '879863686565621790',
    'spellcast': '852509694341283871',
    'sketch': '902271654783242291',
    'blazing-8s': '832025144389533716',
    'putt-party': '945737671223947305',
    'land-io': '903769130790969345',
    'bobble': '947957217959759964',
    'know-what': '976052223358406656'
};

// Activity names for display
const ACTIVITY_NAMES = {
    'youtube': 'YouTube Together',
    'poker': 'Poker Night',
    'chess': 'Chess in the Park',
    'checkers': 'Checkers in the Park',
    'letter-league': 'Letter League',
    'spellcast': 'SpellCast',
    'sketch': 'Sketch Heads',
    'blazing-8s': 'Blazing 8s',
    'putt-party': 'Putt Party',
    'land-io': 'Land-io',
    'bobble': 'Bobble League',
    'know-what': 'Know What I Mean'
};

export default {
    data: new SlashCommandBuilder()
        .setName('activity')
        .setDescription('Start a Discord Activity in your voice channel')
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.Connect)
        
        // YouTube Together
        .addSubcommand(subcommand =>
            subcommand
                .setName('youtube')
                .setDescription('Watch YouTube videos together in a voice channel')
        )
        
        // Poker Night
        .addSubcommand(subcommand =>
            subcommand
                .setName('poker')
                .setDescription('Play Poker Night with friends')
        )
        
        // Chess in the Park
        .addSubcommand(subcommand =>
            subcommand
                .setName('chess')
                .setDescription('Play Chess in the Park')
        )
        
        // Checkers in the Park
        .addSubcommand(subcommand =>
            subcommand
                .setName('checkers')
                .setDescription('Play Checkers in the Park')
        )
        
        // Letter League
        .addSubcommand(subcommand =>
            subcommand
                .setName('letter-league')
                .setDescription('Play the word-based game Letter League')
        )
        
        // SpellCast
        .addSubcommand(subcommand =>
            subcommand
                .setName('spellcast')
                .setDescription('Play the magical word game SpellCast')
        )
        
        // Sketch Heads
        .addSubcommand(subcommand =>
            subcommand
                .setName('sketch')
                .setDescription('Play Sketch Heads (Pictionary style)')
        )
        
        // Blazing 8s
        .addSubcommand(subcommand =>
            subcommand
                .setName('blazing-8s')
                .setDescription('Play the card game Blazing 8s')
        )
        
        // Putt Party
        .addSubcommand(subcommand =>
            subcommand
                .setName('putt-party')
                .setDescription('Play Putt Party (Mini-golf)')
        )
        
        // Land-io
        .addSubcommand(subcommand =>
            subcommand
                .setName('land-io')
                .setDescription('Play the territory game Land-io')
        )
        
        // Bobble League
        .addSubcommand(subcommand =>
            subcommand
                .setName('bobble')
                .setDescription('Play Bobble League')
        )
        
        // Know What I Mean
        .addSubcommand(subcommand =>
            subcommand
                .setName('know-what')
                .setDescription('Play Know What I Mean')
        ),

    category: "Fun",

    async execute(interaction) {
        await interaction.deferReply({ flags: ["Ephemeral"] });

        const { member, options } = interaction;
        const activity = options.getSubcommand();
        const activityId = ACTIVITIES[activity];
        const activityName = ACTIVITY_NAMES[activity] || activity;

        // Check if user is in a voice channel
        if (!member.voice.channel) {
            return interaction.editReply({
                embeds: [errorEmbed('You need to be in a voice channel to start an activity!')]
            });
        }

        // Check if the bot has permission to create invites
        const permissions = member.voice.channel.permissionsFor(interaction.guild.members.me);
        if (!permissions.has('CreateInstantInvite')) {
            return interaction.editReply({
                embeds: [errorEmbed('I need the `Create Invite` permission to start an activity!')]
            });
        }

        try {
            // Create the activity invite link
            const invite = await interaction.client.rest.post(
                `/channels/${member.voice.channel.id}/invites`,
                {
                    body: {
                        max_age: 86400, // 24 hours
                        target_type: 2, // Activity invite
                        target_application_id: activityId,
                    },
                }
            );

            // Send the invite link
            await interaction.editReply({
                embeds: [successEmbed(
                    `Click the link below to start **${activityName}** in ${member.voice.channel.name}!\n` +
                    `[Join ${activityName} Activity](https://discord.gg/${invite.code})`
                )]
            });

        } catch (error) {
            console.error('Error creating activity invite:', error);
            await interaction.editReply({
                embeds: [errorEmbed('Failed to create the activity. Please try again later.')]
            });
        }
    },
};
