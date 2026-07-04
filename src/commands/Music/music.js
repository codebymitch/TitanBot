import { SlashCommandBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import {
    skipTrack,
    stopPlayback,
    pausePlayback,
    resumePlayback,
    shuffleQueue,
    setLoopMode,
    setVolume,
    seekTrack,
    removeFromQueue,
    moveInQueue,
    clearQueue,
    setTwentyFourSeven,
    leaveVoiceChannel,
    replyMusicSuccess,
} from '../../services/music/musicActions.js';
import { deferMusicCommand } from '../../services/music/prefixSupport.js';

export default {
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('music')
        .setDescription('Manage playback, queue, and voice session settings')
        .addSubcommand((sub) =>
            sub.setName('pause').setDescription('Pause playback'),
        )
        .addSubcommand((sub) =>
            sub.setName('resume').setDescription('Resume playback'),
        )
        .addSubcommand((sub) =>
            sub.setName('skip').setDescription('Skip the current track'),
        )
        .addSubcommand((sub) =>
            sub.setName('stop').setDescription('Stop playback and clear the queue'),
        )
        .addSubcommand((sub) =>
            sub.setName('shuffle').setDescription('Shuffle the queue'),
        )
        .addSubcommand((sub) =>
            sub
                .setName('loop')
                .setDescription('Set loop mode')
                .addStringOption((opt) =>
                    opt
                        .setName('mode')
                        .setDescription('Loop mode')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Off', value: 'none' },
                            { name: 'Track', value: 'track' },
                            { name: 'Queue', value: 'queue' },
                        ),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('volume')
                .setDescription('Set playback volume')
                .addIntegerOption((opt) =>
                    opt.setName('level').setDescription('Volume (0-100)').setRequired(true).setMinValue(0).setMaxValue(100),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('seek')
                .setDescription('Seek to a position in the current track')
                .addIntegerOption((opt) =>
                    opt.setName('seconds').setDescription('Position in seconds').setRequired(true).setMinValue(0),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('remove')
                .setDescription('Remove a track from the queue')
                .addIntegerOption((opt) =>
                    opt.setName('position').setDescription('Queue position').setRequired(true).setMinValue(1),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('move')
                .setDescription('Move a track in the queue')
                .addIntegerOption((opt) =>
                    opt.setName('from').setDescription('Current position').setRequired(true).setMinValue(1),
                )
                .addIntegerOption((opt) =>
                    opt.setName('to').setDescription('New position').setRequired(true).setMinValue(1),
                ),
        )
        .addSubcommand((sub) =>
            sub.setName('clear').setDescription('Clear the queue'),
        )
        .addSubcommand((sub) =>
            sub.setName('leave').setDescription('Disconnect the bot from the voice channel'),
        )
        .addSubcommand((sub) =>
            sub
                .setName('247')
                .setDescription('Toggle 24/7 mode (stay in voice channel when idle)')
                .addBooleanOption((opt) =>
                    opt.setName('enabled').setDescription('Enable or disable 24/7 mode').setRequired(true),
                ),
        ),

    async execute(interaction, config, client) {
        try {
            await deferMusicCommand(interaction);
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'pause': {
                    const embed = await pausePlayback(client, interaction);
                    await replyMusicSuccess(interaction, embed);
                    break;
                }
                case 'resume': {
                    const embed = await resumePlayback(client, interaction);
                    await replyMusicSuccess(interaction, embed);
                    break;
                }
                case 'skip': {
                    const embed = await skipTrack(client, interaction);
                    await replyMusicSuccess(interaction, embed);
                    break;
                }
                case 'stop': {
                    const embed = await stopPlayback(client, interaction);
                    await replyMusicSuccess(interaction, embed);
                    break;
                }
                case 'shuffle': {
                    const embed = await shuffleQueue(client, interaction);
                    await replyMusicSuccess(interaction, embed);
                    break;
                }
                case 'loop': {
                    const embed = await setLoopMode(client, interaction, interaction.options.getString('mode'));
                    await replyMusicSuccess(interaction, embed);
                    break;
                }
                case 'volume': {
                    const embed = await setVolume(client, interaction, interaction.options.getInteger('level'));
                    await replyMusicSuccess(interaction, embed);
                    break;
                }
                case 'seek': {
                    const embed = await seekTrack(client, interaction, interaction.options.getInteger('seconds'));
                    await replyMusicSuccess(interaction, embed);
                    break;
                }
                case 'remove': {
                    const embed = await removeFromQueue(client, interaction, interaction.options.getInteger('position'));
                    await replyMusicSuccess(interaction, embed);
                    break;
                }
                case 'move': {
                    const embed = await moveInQueue(
                        client,
                        interaction,
                        interaction.options.getInteger('from'),
                        interaction.options.getInteger('to'),
                    );
                    await replyMusicSuccess(interaction, embed);
                    break;
                }
                case 'clear': {
                    const embed = await clearQueue(client, interaction);
                    await replyMusicSuccess(interaction, embed);
                    break;
                }
                case 'leave': {
                    const embed = await leaveVoiceChannel(client, interaction);
                    await replyMusicSuccess(interaction, embed);
                    break;
                }
                case '247': {
                    const embed = await setTwentyFourSeven(client, interaction, interaction.options.getBoolean('enabled'));
                    await replyMusicSuccess(interaction, embed);
                    break;
                }
                default:
                    await InteractionHelper.safeEditReply(interaction, {
                        content: 'Unknown music subcommand.',
                    });
            }
        } catch (error) {
            await handleInteractionError(interaction, error, { command: 'music' });
        }
    },
};
