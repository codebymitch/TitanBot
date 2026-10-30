import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { soloRewardText } from '../../services/games/solo.js';

// Rock-paper-scissors against the bot with buttons: `rps` / `حجر`. A win pays solo CC.
const IDLE_MS = 20_000;
const CHOICES = {
    rock: { emoji: '🪨', name: 'حجر', beats: 'scissors' },
    paper: { emoji: '📄', name: 'ورقة', beats: 'rock' },
    scissors: { emoji: '✂️', name: 'مقص', beats: 'paper' },
};

export function decide(player, bot) {
    if (player === bot) return 'draw';
    return CHOICES[player].beats === bot ? 'win' : 'lose';
}

function buildRow(disabled = false) {
    return new ActionRowBuilder().addComponents(
        Object.entries(CHOICES).map(([key, choice]) => new ButtonBuilder()
            .setCustomId(`rps_${key}`)
            .setEmoji(choice.emoji)
            .setLabel(choice.name)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled)),
    );
}

export default {
    data: new SlashCommandBuilder()
        .setName('rps')
        .setDescription('Play rock-paper-scissors against the bot.'),
    category: 'Fun',

    async execute(interaction, config, client) {
        const player = interaction.user;
        await InteractionHelper.safeReply(interaction, {
            content: `${player} اختار: حجر، ورقة ولا مقص؟`,
            components: [buildRow()],
            allowedMentions: { parse: [] },
        });
        const message = await interaction.fetchReply();
        const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, idle: IDLE_MS, max: 1, filter: (button) => {
            if (button.user.id === player.id) return true;
            button.reply({ content: 'دي مش لعبتك، اكتب `rps` وابدأ لعبتك.', flags: MessageFlags.Ephemeral }).catch(() => {});
            return false;
        } });

        collector.on('collect', async (button) => {
            const pick = button.customId.split('_')[1];
            const botPick = Object.keys(CHOICES)[Math.floor(Math.random() * 3)];
            const result = decide(pick, botPick);
            const reward = result === 'win' ? ` ${await soloRewardText(client, interaction.guildId, player.id, 'rps')}` : '';
            const verdict = result === 'win' ? `🏆 كسبت!${reward}` : result === 'lose' ? '😈 البوت كسب!' : '🤝 تعادل!';
            await button.update({
                content: `${player}: ${CHOICES[pick].emoji} ${CHOICES[pick].name}\nالبوت: ${CHOICES[botPick].emoji} ${CHOICES[botPick].name}\n${verdict}`,
                components: [buildRow(true)],
                allowedMentions: { parse: [] },
            }).catch(() => {});
        });

        collector.on('end', async (collected) => {
            if (collected.size) return;
            await message.edit({ content: `🚫 ${player} اتطرد بسبب AFK (ما اختارش في ${IDLE_MS / 1000} ثانية).`, components: [buildRow(true)], allowedMentions: { parse: [] } }).catch(() => {});
        });
    },
};
