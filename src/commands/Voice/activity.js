import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

const ACTIVITIES = {
    'youtube': '880218394199220334',
    'poker': '755827207812677713',
    'chess': '832012774040141894',
    'checkers': '832013003968348200',
    'letter-league': '879863686565621790',
    'spellcast': '852509694341283871',
    'sketch': '902271654783242291',
    'blazing8s': '832025144389533716',
    'puttparty': '945737671223947305',
    'landio': '903769130790969345',
    'bobble': '947957217959759964',
    'knowwhat': '976052223358406656'
};

const ACTIVITY_NAMES = {
    'youtube': 'YouTube Together',
    'poker': 'Poker Night',
    'chess': 'Chess in the Park',
    'checkers': 'Checkers in the Park',
    'letter-league': 'Letter League',
    'spellcast': 'SpellCast',
    'sketch': 'Sketch Heads',
    'blazing8s': 'Blazing 8s',
    'puttparty': 'Putt Party',
    'landio': 'Land-io',
    'bobble': 'Bobble League',
    'knowwhat': 'Know What I Mean'
};

export default {
    data: new SlashCommandBuilder()
        .setName('activity')
        .setDescription('Start a Discord Activity in your voice channel')
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.Connect)
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('youtube')
                .setDescription('Watch YouTube videos together in a voice channel')
        )
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('poker')
                .setDescription('Play Poker Night with friends')
        )
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('chess')
                .setDescription('Play Chess in the Park')
        )
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('checkers')
                .setDescription('Play Checkers in the Park')
        )
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('letter-league')
                .setDescription('Play the word-based game Letter League')
        )
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('spellcast')
                .setDescription('Play the magical word game SpellCast')
        )
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('sketch')
                .setDescription('Play Sketch Heads (Pictionary style)')
        )
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('blazing8s')
                .setDescription('Play the card game Blazing 8s')
        )
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('puttparty')
                .setDescription('Play Putt Party (Mini-golf)')
        )
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('landio')
                .setDescription('Play the territory game Land-io')
        )
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('bobble')
                .setDescription('Play Bobble League')
        )
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('knowwhat')
                .setDescription('Play Know What I Mean')
        ),

    category: "Fun",

    async execute(interaction, config, client) {
    const { member, options } = interaction;
        const activity = options.getSubcommand();
        const activityId = ACTIVITIES[activity];
        const activityName = ACTIVITY_NAMES[activity] || activity;

        if (!member.voice.channel) {
            return await interaction.editReply({
                embeds: [errorEmbed('You need to be in a voice channel to start an activity!')]
            });
        }

        const permissions = member.voice.channel.permissionsFor(interaction.guild.members.me);
        if (!permissions.has('CreateInstantInvite')) {
            return await interaction.editReply({
                embeds: [errorEmbed('I need the `Create Invite` permission to start an activity!')]
            });
        }

        try {
            const invite = await interaction.client.rest.post(
                `/channels/${member.voice.channel.id}/invites`,
                {
                    body: {
max_age: 86400,
target_type: 2,
                        target_application_id: activityId,
                    },
                }
            );

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

