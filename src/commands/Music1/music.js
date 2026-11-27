import { SlashCommandBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
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
    replyMusicError,
} from '../../services/music/musicActions.js';
import { deferMusicCommand } from '../../services/music/prefixSupport.js';

const SUBCOMMAND_HANDLERS = {
    pause: (client, interaction) => pausePlayback(client, interaction),
    resume: (client, interaction) => resumePlayback(client, interaction),
    skip: (client, interaction) => skipTrack(client, interaction),
    stop: (client, interaction) => stopPlayback(client, interaction),
    shuffle: (client, interaction) => shuffleQueue(client, interaction),
    loop: (client, interaction) =>
        setLoopMode(client, interaction, interaction.options.getString('mode', true)),
    volume: (client, interaction) =>
        setVolume(client, interaction, interaction.options.getInteger('level', true)),
    seek: (client, interaction) =>
        seekTrack(client, interaction, interaction.options.getInteger('seconds', true)),
    remove: (client, interaction) =>
        removeFromQueue(client, interaction, interaction.options.getInteger('position', true)),
    move: (client, interaction) =>
        moveInQueue(
            client,
            interaction,
            interaction.options.getInteger('from', true),
            interaction.options.getInteger('to', true),
        ),
    clear: (client, interaction) => clearQueue(client, interaction),
    leave: (client, interaction) => leaveVoiceChannel(client, interaction),
    247: (client, interaction) =>
        setTwentyFourSeven(client, interaction, interaction.options.getBoolean('enabled', true)),
};

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
                    opt
                        .setName('level')
                        .setDescription('Volume (0-100)')
                        .setRequired(true)
                        .setMinValue(0)
                        .setMaxValue(100),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('seek')
                .setDescription('Seek to a position in the current track')
                .addIntegerOption((opt) =>
                    opt
                        .setName('seconds')
                        .setDescription('Position in seconds')
                        .setRequired(true)
                        .setMinValue(0),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('remove')
                .setDescription('Remove a track from the queue')
                .addIntegerOption((opt) =>
                    opt
                        .setName('position')
                        .setDescription('Queue position')
                        .setRequired(true)
                        .setMinValue(1),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('move')
                .setDescription('Move a track in the queue')
                .addIntegerOption((opt) =>
                    opt
                        .setName('from')
                        .setDescription('Current position')
                        .setRequired(true)
                        .setMinValue(1),
                )
                .addIntegerOption((opt) =>
                    opt
                        .setName('to')
                        .setDescription('New position')
                        .setRequired(true)
                        .setMinValue(1),
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
                    opt
                        .setName('enabled')
                        .setDescription('Enable or disable 24/7 mode')
                        .setRequired(true),
                ),
        ),

    async execute(interaction, config, client) {
        const deferred = await deferMusicCommand(interaction);
        if (deferred === false) {
            return;
        }

        const guildId = interaction.guildId ?? interaction.guild?.id;
        if (!guildId) {
            await InteractionHelper.safeEditReply(interaction, {
                content: 'هذا الأمر يعمل داخل السيرفرات فقط.',
            });
            return;
        }

        const subcommand = interaction.options.getSubcommand();
        const handler = SUBCOMMAND_HANDLERS[subcommand];

        if (!handler) {
            await replyMusicError(interaction, 'أمر فرعي غير معروف.');
            return;
        }

        const result = await handler(client, interaction);

        if (result && typeof result === 'object' && 'ok' in result) {
            if (!result.ok) {
                await replyMusicError(interaction, result.message ?? 'تعذر تنفيذ الأمر.');
                return;
            }
            await replyMusicSuccess(interaction, result.embed);
            return;
        }

        await replyMusicSuccess(interaction, result);
    },
};
