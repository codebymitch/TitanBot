import { SlashCommandBuilder } from 'discord.js';
import type { LoopOption } from 'riffy';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
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
} from '../../../services/music/musicActions.js';
import { deferMusicCommand } from '../../../services/music/prefixSupport.js';
import type { Command } from '../../../types/index.js';

export default {
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('music')
        .setDescription('Wiedergabe, Warteschlange und Sprachsitzung verwalten')
        .addSubcommand((sub) =>
            sub.setName('pause').setDescription('Wiedergabe pausieren'),
        )
        .addSubcommand((sub) =>
            sub.setName('resume').setDescription('Wiedergabe fortsetzen'),
        )
        .addSubcommand((sub) =>
            sub.setName('skip').setDescription('Aktuellen Titel überspringen'),
        )
        .addSubcommand((sub) =>
            sub.setName('stop').setDescription('Wiedergabe stoppen und Warteschlange leeren'),
        )
        .addSubcommand((sub) =>
            sub.setName('shuffle').setDescription('Warteschlange mischen'),
        )
        .addSubcommand((sub) =>
            sub
                .setName('loop')
                .setDescription('Wiederholungsmodus festlegen')
                .addStringOption((opt) =>
                    opt
                        .setName('mode')
                        .setDescription('Wiederholungsmodus')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Aus', value: 'none' },
                            { name: 'Titel', value: 'track' },
                            { name: 'Warteschlange', value: 'queue' },
                        ),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('volume')
                .setDescription('Lautstärke einstellen')
                .addIntegerOption((opt) =>
                    opt.setName('level').setDescription('Lautstärke (0-100)').setRequired(true).setMinValue(0).setMaxValue(100),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('seek')
                .setDescription('Zu einer Position im aktuellen Titel springen')
                .addIntegerOption((opt) =>
                    opt.setName('seconds').setDescription('Position in Sekunden').setRequired(true).setMinValue(0),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('remove')
                .setDescription('Titel aus der Warteschlange entfernen')
                .addIntegerOption((opt) =>
                    opt.setName('position').setDescription('Position in der Warteschlange').setRequired(true).setMinValue(1),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('move')
                .setDescription('Titel in der Warteschlange verschieben')
                .addIntegerOption((opt) =>
                    opt.setName('from').setDescription('Aktuelle Position').setRequired(true).setMinValue(1),
                )
                .addIntegerOption((opt) =>
                    opt.setName('to').setDescription('Neue Position').setRequired(true).setMinValue(1),
                ),
        )
        .addSubcommand((sub) =>
            sub.setName('clear').setDescription('Warteschlange leeren'),
        )
        .addSubcommand((sub) =>
            sub.setName('leave').setDescription('Bot vom Sprachkanal trennen'),
        )
        .addSubcommand((sub) =>
            sub
                .setName('247')
                .setDescription('24/7-Modus umschalten (auch ohne Wiedergabe im Sprachkanal bleiben)')
                .addBooleanOption((opt) =>
                    opt.setName('enabled').setDescription('24/7-Modus aktivieren oder deaktivieren').setRequired(true),
                ),
        ),

    async execute(interaction, config, client) {
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
                const embed = await setLoopMode(client, interaction, interaction.options.getString('mode')! as LoopOption);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'volume': {
                const embed = await setVolume(client, interaction, interaction.options.getInteger('level')!);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'seek': {
                const embed = await seekTrack(client, interaction, interaction.options.getInteger('seconds')!);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'remove': {
                const embed = await removeFromQueue(client, interaction, interaction.options.getInteger('position')!);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'move': {
                const embed = await moveInQueue(
                    client,
                    interaction,
                    interaction.options.getInteger('from')!,
                    interaction.options.getInteger('to')!,
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
                const embed = await setTwentyFourSeven(client, interaction, interaction.options.getBoolean('enabled')!);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            default:
                await InteractionHelper.safeEditReply(interaction, {
                    content: 'Unbekannter Musik-Subcommand.',
                });
        }
    },
} satisfies Command;
