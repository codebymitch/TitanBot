import { MessageFlags } from 'discord.js';
import { PANEL_BUTTON_PREFIX, isGroupGame, startGroupGame, stopGroupGame } from '../../../services/games/panel.js';
import { startSoloGame } from '../../../services/games/solo.js';
import { ccProfileEmbed } from '../../../commands/Games/cc.js';
import { ccTopEmbed } from '../../../commands/Games/cctop.js';
import rpsCommand from '../../../commands/Fun/rps.js';
import { gamesEnabled, GAMES_MOVED_NOTICE } from '../../../config/games.js';

// Buttons of the `العاب` panel (`gamespanel:<action>`). Games start in the panel's channel; balance
// and top answer privately so the games channel stays clean. Game buttons have a short
// per-member cooldown so they can't be spammed. While the games are off (config/games.js) the game
// buttons of an old panel say the games moved; balance and top keep working (the old daily button
// says it's gone).
const PRESS_COOLDOWN_MS = 3_000;
const lastPress = new Map();

function onCooldown(userId) {
    const now = Date.now();
    if (now - (lastPress.get(userId) || 0) < PRESS_COOLDOWN_MS) return true;
    lastPress.set(userId, now);
    return false;
}

async function execute(interaction, client, [action]) {
    if (!interaction.inGuild()) return;
    const startsGame = isGroupGame(action) || action.startsWith('solo_') || action === 'rps';
    if ((startsGame || action === 'stop') && !gamesEnabled()) {
        await interaction.reply({ content: GAMES_MOVED_NOTICE, flags: MessageFlags.Ephemeral }).catch(() => {});
        return;
    }
    if (startsGame && onCooldown(interaction.user.id)) {
        await interaction.reply({ content: '⏳ استنى ثانية.', flags: MessageFlags.Ephemeral }).catch(() => {});
        return;
    }

    if (isGroupGame(action)) return startGroupGame(interaction, client, action);
    if (action.startsWith('solo_')) return startSoloGame(interaction, client, action.slice('solo_'.length));
    if (action === 'rps') return rpsCommand.execute(interaction, null, client);
    if (action === 'stop') return stopGroupGame(interaction);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    let embed = null;
    if (action === 'balance') embed = await ccProfileEmbed(client, interaction.guildId, interaction.user);
    if (action === 'top') embed = await ccTopEmbed(client, interaction.guild, interaction.user.id);
    await interaction.editReply(embed ? { embeds: [embed], allowedMentions: { parse: [] } } : { content: 'الزرار ده مبقاش شغال، اكتب `العاب` تاني.' });
}

export default { name: PANEL_BUTTON_PREFIX, execute };
