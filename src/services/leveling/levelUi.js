// levelUi.js — how the level system looks: the level-up message, the rank card and the top 10.
// Embeds are plain objects on purpose: EmbedBuilder titles lose their emojis (src/utils/embeds.js).

const COLORS = { levelUp: 0x5865f2, milestone: 0xf1c40f, rank: 0x5865f2, top: 0xf1c40f, chat: 0x57f287, voice: 0xeb459e };
const MEDALS = ['🥇', '🥈', '🥉'];
// A real ping only every 5 levels; other level-ups show the member without notifying them.
export const PING_EVERY_LEVELS = 5;

/** Whether reaching any level in (fromLevel, toLevel] should ping the member. */
export function isMilestone(fromLevel, toLevel) {
    for (let level = fromLevel + 1; level <= toLevel; level += 1) {
        if (level % PING_EVERY_LEVELS === 0) return true;
    }
    return false;
}

export function progressBar(current, needed, size = 12) {
    const ratio = needed > 0 ? Math.max(0, Math.min(1, current / needed)) : 0;
    const filled = Math.round(ratio * size);
    return `${'▰'.repeat(filled)}${'▱'.repeat(size - filled)} ${Math.floor(ratio * 100)}%`;
}

const number = (value) => Number(value || 0).toLocaleString('en-US');

/** `125` → `2س 5د`, `40` → `40د`. */
export function formatVoiceTime(minutes) {
    const total = Math.max(0, Math.floor(Number(minutes) || 0));
    const hours = Math.floor(total / 60);
    const rest = total % 60;
    if (!hours) return `${rest}د`;
    return rest ? `${hours.toLocaleString('en-US')}س ${rest}د` : `${hours.toLocaleString('en-US')}س`;
}

const SOURCES = {
    chat: { icon: '💬', name: 'الشات', how: 'من الكلام في الشات', color: COLORS.chat },
    voice: { icon: '🎙️', name: 'الفويس', how: 'من القعدة في الفويس', color: COLORS.voice },
};

/**
 * The level-up message. It says clearly where the XP came from (chat or voice) with its own colour,
 * icon and title, then the member's totals and the progress to the next level.
 * Every 5th level it pings the member (content mention); otherwise the member is shown as a mention
 * inside the embed, which never notifies anyone.
 */
export function buildLevelUpMessage(member, { fromLevel, level, xp, xpNeeded, rewardRoleIds = [], source = 'chat', messages = null, voiceMinutes = null, ccReward = 0, ccBoost = 1 }) {
    const milestone = isMilestone(fromLevel, level);
    const nextMilestone = Math.ceil((level + 1) / PING_EVERY_LEVELS) * PING_EVERY_LEVELS;
    const from = SOURCES[source] || SOURCES.chat;
    const totals = [
        messages === null ? null : `💬 الرسايل: **${number(messages)}**`,
        voiceMinutes === null ? null : `🎙️ الفويس: **${formatVoiceTime(voiceMinutes)}**`,
    ].filter(Boolean).join('  •  ');

    const lines = [
        milestone ? `🎉 مبروك ${member}! وصلت **لفل ${level}**` : `${member} وصل **لفل ${level}**`,
        `${from.icon} ${from.how}`,
        totals ? `\n${totals}` : null,
        '',
        `📈 **التقدم للفل ${level + 1}**`,
        `${progressBar(xp, xpNeeded)}  \`${number(xp)} / ${number(xpNeeded)} XP\``,
        ccReward > 0 ? `\n🌀 **+${number(ccReward)} CC**${ccBoost > 1 ? ` 🔥 (×${ccBoost})` : ''}` : null,
        rewardRoleIds.length ? `\n🎁 **رتبة جديدة:** ${rewardRoleIds.map((id) => `<@&${id}>`).join(' ')}` : null,
    ].filter((line) => line !== null);

    return {
        content: milestone ? `${member}` : null,
        embeds: [{
            color: milestone ? COLORS.milestone : from.color,
            author: { name: member.displayName || member.user?.username, icon_url: member.displayAvatarURL?.() },
            title: milestone ? `🏆 إنجاز — لفل ${level} ${from.icon}` : `${from.icon} لفل ${level} من ${from.name}`,
            thumbnail: { url: member.displayAvatarURL?.({ size: 256 }) },
            description: lines.join('\n'),
            footer: { text: milestone ? 'rank لمستواك • top للترتيب' : `المنشن الجاي في لفل ${nextMilestone} • rank لمستواك` },
            timestamp: new Date().toISOString(),
        }],
        allowedMentions: milestone ? { users: [member.id] } : { parse: [] },
    };
}

/** `rank`: the member's level card. `position` is their place on the server (null when unranked). */
export function buildRankEmbed(member, { level, xp, totalXp, xpNeeded, position, rankedCount, messages = null, voiceMinutes = null }) {
    return {
        color: COLORS.rank,
        author: { name: member.displayName || member.user?.username, icon_url: member.displayAvatarURL?.() },
        title: '📊 المستوى',
        thumbnail: { url: member.displayAvatarURL?.({ size: 256 }) },
        fields: [
            { name: '⭐ اللفل', value: `**${level}**`, inline: true },
            { name: '🏅 الترتيب', value: position ? `**#${position}** من ${rankedCount}` : 'لسه مش في الترتيب', inline: true },
            { name: '✨ إجمالي XP', value: `**${number(totalXp)}**`, inline: true },
            ...(messages === null ? [] : [{ name: '💬 الرسايل', value: `**${number(messages)}**`, inline: true }]),
            ...(voiceMinutes === null ? [] : [{ name: '🎙️ الفويس', value: `**${formatVoiceTime(voiceMinutes)}**`, inline: true }]),
            { name: `📈 التقدم للفل ${level + 1}`, value: `${progressBar(xp, xpNeeded, 16)}\n\`${number(xp)} / ${number(xpNeeded)} XP\`` },
        ],
        footer: { text: 'اتكلم في الشات أو الفويس عشان تجمع XP • top للترتيب' },
    };
}

/** `top chat`: the 10 members with the most messages (entries from rankChatCounts) plus the caller's place. */
export function buildTopChatEmbed(guild, entries, { callerId, callerEntry } = {}) {
    const lines = entries.map((entry, index) => {
        const place = MEDALS[index] || `\`#${index + 1}\``;
        return `${place} <@${entry.userId}> — **${number(entry.messages)}** رسالة`;
    });
    const you = callerEntry
        ? `\n\n👤 **ترتيبك:** #${callerEntry.rank} — ${number(callerEntry.messages)} رسالة`
        : callerId && entries.length ? '\n\n👤 رسايلك لسه ما اتحسبتش، اتكلم شوية وهتظهر هنا.' : '';
    return {
        color: COLORS.chat,
        title: `💬 توب الشات — ${guild.name}`,
        thumbnail: guild.iconURL?.() ? { url: guild.iconURL({ size: 256 }) } : undefined,
        description: (lines.join('\n') || '📭 عداد الرسايل لسه بادئ، الرسايل بتتحسب من وقت ما اتضاف.\nاتكلموا في الشات والترتيب هيظهر هنا.') + you,
        footer: { text: 'الترتيب حسب عدد الرسايل • top voice لتوب الفويس' },
    };
}

/** `top voice`: the 10 members with the most voice time (entries from rankVoiceMinutes) plus the caller's place. */
export function buildTopVoiceEmbed(guild, entries, { callerId, callerEntry } = {}) {
    const lines = entries.map((entry, index) => {
        const place = MEDALS[index] || `\`#${index + 1}\``;
        return `${place} <@${entry.userId}> — **${formatVoiceTime(entry.minutes)}**`;
    });
    const you = callerEntry
        ? `\n\n👤 **ترتيبك:** #${callerEntry.rank} — ${formatVoiceTime(callerEntry.minutes)}`
        : callerId && entries.length ? '\n\n👤 لسه ما اتحسبلكش وقت فويس، ادخل روم مع حد وافتح المايك.' : '';
    return {
        color: COLORS.voice,
        title: `🎙️ توب الفويس — ${guild.name}`,
        thumbnail: guild.iconURL?.() ? { url: guild.iconURL({ size: 256 }) } : undefined,
        description: (lines.join('\n') || '📭 عداد الفويس لسه بادئ.\nادخلوا الرومات الصوتية والترتيب هيظهر هنا.') + you,
        footer: { text: 'بيتحسب كل دقيقة مع حد تاني والمايك مفتوح • top chat لتوب الشات' },
    };
}

/** `top level`: the 10 highest members (entries from getLeaderboard) plus the caller's own place. */
export function buildTopEmbed(guild, entries, { callerId, callerEntry } = {}) {
    const lines = entries.map((entry, index) => {
        const place = MEDALS[index] || `\`#${index + 1}\``;
        return `${place} <@${entry.userId}> — لفل **${entry.level}** • ${number(entry.totalXp)} XP`;
    });
    const you = callerEntry
        ? `\n\n👤 **ترتيبك:** #${callerEntry.rank} — لفل ${callerEntry.level} • ${number(callerEntry.totalXp)} XP`
        : callerId && entries.length ? '\n\n👤 لسه ما جمعتش XP، اتكلم في الشات أو الفويس وهتظهر هنا.' : '';
    return {
        color: COLORS.top,
        title: `🏆 توب اللفلات — ${guild.name}`,
        thumbnail: guild.iconURL?.() ? { url: guild.iconURL({ size: 256 }) } : undefined,
        description: (lines.join('\n') || '📭 لسه محدش جمع XP.\nكل رسالة في الشات وكل دقيقة في الفويس بتدي XP، والترتيب هيظهر هنا.') + you,
        footer: { text: 'الترتيب حسب إجمالي XP • top chat و top voice' },
    };
}
