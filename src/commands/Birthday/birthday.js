import { SlashCommandBuilder, MessageFlags, ChannelType } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

import birthdaySet from './modules/birthday_set.js';
import birthdayInfo from './modules/birthday_info.js';
import birthdayList from './modules/birthday_list.js';
import birthdayRemove from './modules/birthday_remove.js';
import nextBirthdays from './modules/next_birthdays.js';
import birthdaySetchannel from './modules/birthday_setchannel.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('생일 설정')
        .setDescription('생일 시스템 명령어 모음이에요')
        .addSubcommand(subcommand =>
            subcommand
                .setName('설정')
                .setDescription('내 생일을 설정해요')
                .addIntegerOption(option =>
                    option
                        .setName('월')
                        .setDescription('태어난 월 (1-12)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(12)
                )
                .addIntegerOption(option =>
                    option
                        .setName('일')
                        .setDescription('태어난 일 (1-31)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(31)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('정보')
                .setDescription('생일 정보를 확인해요')
                .addUserOption(option =>
                    option
                        .setName('유저')
                        .setDescription('생일을 확인할 유저를 선택해요')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('생일 목록')
                .setDescription('서버 내 모든 유저의 생일 목록을 봐요')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('생일 삭제')
                .setDescription('등록된 내 생일을 삭제해요')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('다음 생일 목록')
                .setDescription('다가오는 생일 목록을 확인해요')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('알림 설정')
                .setDescription('생일 알림 채널을 설정하거나 비활성화해요. (서버 관리 권한 필요)')
                .addChannelOption(option =>
                    option
                        .setName('알림 보낼 채널')
                        .setDescription('알림을 보낼 텍스트 채널이에요. 비워두면 비활성화돼요.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false)
                )
        ),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'set':
                return await birthdaySet.execute(interaction, config, client);
            case 'info':
                return await birthdayInfo.execute(interaction, config, client);
            case 'list':
                return await birthdayList.execute(interaction, config, client);
            case 'remove':
                return await birthdayRemove.execute(interaction, config, client);
            case 'next':
                return await nextBirthdays.execute(interaction, config, client);
            case 'setchannel':
                return await birthdaySetchannel.execute(interaction, config, client);
            default:
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: '알 수 없는 하위 명령어예요.' });
        }
    }
}
