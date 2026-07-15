from __future__ import annotations

import re
from collections import defaultdict, deque
from datetime import timedelta

import discord
from discord import app_commands
from discord.ext import commands

from ..embeds import error, success, embed, PURPLE
from ..logging import log
from ..permissions import target_is_manageable

LINK = re.compile(r"https?://|discord(?:app)?\.com/invite/|discord\.gg/", re.I)


class Moderation(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self.recent_messages: dict[int, deque[float]] = defaultdict(deque)

    async def _log(self, interaction: discord.Interaction, action: str, target: discord.Member | discord.User, reason: str) -> None:
        assert interaction.guild
        await log(interaction.guild, self.bot.settings.log_channel_id, f"🛡️ {action}", f"משתמש: {target.mention}\nמנהל: {interaction.user.mention}\nסיבה: {reason}")

    async def _manageable(self, interaction: discord.Interaction, member: discord.Member) -> bool:
        assert interaction.guild and isinstance(interaction.user, discord.Member)
        if target_is_manageable(interaction.user, member, interaction.guild.me):
            return True
        await interaction.response.send_message(embed=error("לא ניתן לבצע פעולה על בעל השרת, מנהל מערכת, משתמש בדרגה שווה או גבוהה, או משתמש שמעל תפקיד הבוט."), ephemeral=True)
        return False

    @app_commands.command(name="warn", description="מתן אזהרה למשתמש")
    @app_commands.checks.has_permissions(moderate_members=True)
    async def warn(self, interaction: discord.Interaction, member: discord.Member, reason: str) -> None:
        if not await self._manageable(interaction, member): return
        await self.bot.db.execute("INSERT INTO warnings (guild_id, user_id, moderator_id, reason) VALUES (?, ?, ?, ?)", (interaction.guild_id, member.id, interaction.user.id, reason))
        await interaction.response.send_message(embed=success(f"{member.mention} קיבל/ה אזהרה.\nסיבה: {reason}"), ephemeral=True)
        await self._log(interaction, "אזהרה", member, reason)

    @app_commands.command(name="timeout", description="השתקת משתמש לזמן מוגבל")
    @app_commands.checks.has_permissions(moderate_members=True)
    async def timeout(self, interaction: discord.Interaction, member: discord.Member, minutes: app_commands.Range[int, 1, 40320], reason: str = "לא צוינה") -> None:
        if not await self._manageable(interaction, member): return
        await member.timeout(timedelta(minutes=minutes), reason=reason)
        await interaction.response.send_message(embed=success(f"{member.mention} הושתק/ה ל־{minutes} דקות."), ephemeral=True)
        await self._log(interaction, "Timeout", member, reason)

    @app_commands.command(name="kick", description="הסרת משתמש מהשרת")
    @app_commands.checks.has_permissions(kick_members=True)
    async def kick(self, interaction: discord.Interaction, member: discord.Member, reason: str = "לא צוינה") -> None:
        if not await self._manageable(interaction, member): return
        await member.kick(reason=reason)
        await interaction.response.send_message(embed=success(f"{member} הוסר/ה מהשרת."), ephemeral=True)
        await self._log(interaction, "Kick", member, reason)

    @app_commands.command(name="ban", description="חסימת משתמש מהשרת")
    @app_commands.checks.has_permissions(ban_members=True)
    async def ban(self, interaction: discord.Interaction, member: discord.Member, reason: str = "לא צוינה") -> None:
        if not await self._manageable(interaction, member): return
        await member.ban(reason=reason)
        await interaction.response.send_message(embed=success(f"{member} נחסם/ה מהשרת."), ephemeral=True)
        await self._log(interaction, "Ban", member, reason)

    @app_commands.command(name="clear", description="מחיקת הודעות מערוץ")
    @app_commands.checks.has_permissions(manage_messages=True)
    async def clear(self, interaction: discord.Interaction, amount: app_commands.Range[int, 1, 100]) -> None:
        assert isinstance(interaction.channel, discord.TextChannel)
        await interaction.response.defer(ephemeral=True)
        deleted = await interaction.channel.purge(limit=amount)
        await interaction.followup.send(embed=success(f"נמחקו {len(deleted)} הודעות."), ephemeral=True)
        await log(interaction.guild, self.bot.settings.log_channel_id, "🧹 ניקוי הודעות", f"{interaction.user.mention} מחק/ה {len(deleted)} הודעות ב־{interaction.channel.mention}.")

    @app_commands.command(name="warnings", description="הצגת אזהרות למשתמש")
    @app_commands.checks.has_permissions(moderate_members=True)
    async def warnings(self, interaction: discord.Interaction, member: discord.Member) -> None:
        rows = await self.bot.db.fetchall("SELECT id, moderator_id, reason, created_at FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY id DESC LIMIT 20", (interaction.guild_id, member.id))
        lines = [f"`#{row[0]}` — {row[2]} (<@{row[1]}>, {row[3]})" for row in rows]
        await interaction.response.send_message(embed=embed(f"⚠️ אזהרות של {member}", "\n".join(lines) or "אין אזהרות.", PURPLE), ephemeral=True)

    @app_commands.command(name="clearwarnings", description="מחיקת אזהרות של משתמש")
    @app_commands.checks.has_permissions(manage_guild=True)
    async def clearwarnings(self, interaction: discord.Interaction, member: discord.Member) -> None:
        cursor = await self.bot.db.execute("DELETE FROM warnings WHERE guild_id = ? AND user_id = ?", (interaction.guild_id, member.id))
        await interaction.response.send_message(embed=success(f"נמחקו {cursor.rowcount} אזהרות של {member.mention}."), ephemeral=True)

    @app_commands.command(name="unban", description="הסרת חסימה לפי מזהה משתמש")
    @app_commands.checks.has_permissions(ban_members=True)
    async def unban(self, interaction: discord.Interaction, user_id: str, reason: str = "לא צוינה") -> None:
        if not user_id.isdigit():
            await interaction.response.send_message(embed=error("מזהה המשתמש אינו תקין."), ephemeral=True); return
        user = await self.bot.fetch_user(int(user_id))
        await interaction.guild.unban(user, reason=reason)
        await interaction.response.send_message(embed=success(f"החסימה של {user} הוסרה."), ephemeral=True)

    @app_commands.command(name="lock", description="נעילת הערוץ")
    @app_commands.checks.has_permissions(manage_channels=True)
    async def lock(self, interaction: discord.Interaction) -> None:
        await interaction.response.defer(ephemeral=True)
        await interaction.channel.set_permissions(interaction.guild.default_role, send_messages=False, reason=f"Locked by {interaction.user}")
        await interaction.followup.send(embed=success("הערוץ ננעל."), ephemeral=True)

    @app_commands.command(name="unlock", description="פתיחת הערוץ")
    @app_commands.checks.has_permissions(manage_channels=True)
    async def unlock(self, interaction: discord.Interaction) -> None:
        await interaction.response.defer(ephemeral=True)
        await interaction.channel.set_permissions(interaction.guild.default_role, send_messages=None, reason=f"Unlocked by {interaction.user}")
        await interaction.followup.send(embed=success("הערוץ נפתח."), ephemeral=True)

    @app_commands.command(name="slowmode", description="הגדרת מצב איטי בערוץ")
    @app_commands.checks.has_permissions(manage_channels=True)
    async def slowmode(self, interaction: discord.Interaction, seconds: app_commands.Range[int, 0, 21600]) -> None:
        await interaction.response.defer(ephemeral=True)
        await interaction.channel.edit(slowmode_delay=seconds, reason=f"Changed by {interaction.user}")
        await interaction.followup.send(embed=success(f"מצב איטי נקבע ל־{seconds} שניות."), ephemeral=True)

    @app_commands.command(name="nick", description="שינוי כינוי למשתמש")
    @app_commands.checks.has_permissions(manage_nicknames=True)
    async def nick(self, interaction: discord.Interaction, member: discord.Member, nickname: app_commands.Range[str, 1, 32] | None = None) -> None:
        if not await self._manageable(interaction, member): return
        await member.edit(nick=nickname, reason=f"Changed by {interaction.user}")
        await interaction.response.send_message(embed=success("הכינוי עודכן."), ephemeral=True)

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message) -> None:
        if not message.guild or message.author.bot or not isinstance(message.author, discord.Member):
            return
        now = discord.utils.utcnow().timestamp()
        queue = self.recent_messages[message.author.id]
        queue.append(now)
        while queue and now - queue[0] > 8:
            queue.popleft()
        if len(queue) >= 6:
            await message.author.timeout(timedelta(minutes=5), reason="אנטי-ספאם")
            queue.clear()
            await log(message.guild, self.bot.settings.log_channel_id, "🚫 אנטי-ספאם", f"{message.author.mention} הושתק/ה אוטומטית ל־5 דקות.")
            return
        content = message.content.casefold()
        if any(word in content for word in self.bot.settings.bad_words) or (LINK.search(message.content) and message.channel.id not in self.bot.settings.allowed_link_channels and not message.author.guild_permissions.manage_messages):
            await message.delete()
            await message.channel.send(f"{message.author.mention} ההודעה הוסרה לפי כללי הקהילה.", delete_after=5)
            await log(message.guild, self.bot.settings.log_channel_id, "🛡️ סינון אוטומטי", f"הודעה של {message.author.mention} הוסרה ב־{message.channel.mention}.")

    @warn.error
    @timeout.error
    @kick.error
    @ban.error
    @clear.error
    async def permissions_error(self, interaction: discord.Interaction, _: app_commands.AppCommandError) -> None:
        if not interaction.response.is_done():
            await interaction.response.send_message(embed=error("אין לך את ההרשאה הדרושה לפעולה זו."), ephemeral=True)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Moderation(bot))
