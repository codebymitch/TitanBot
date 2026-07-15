from __future__ import annotations

from collections import defaultdict

import discord
from discord import app_commands
from discord.ext import commands

from ..embeds import PURPLE, embed, error, success

REWARDS = {5: "🌱 עורך מתחיל", 15: "🎬 עורך", 30: "⭐ עורך מקצועי", 50: "💎 עורך אגדי"}


class Levels(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self.cooldowns: dict[int, float] = defaultdict(float)

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message) -> None:
        if not message.guild or message.author.bot:
            return
        now = discord.utils.utcnow().timestamp()
        if now - self.cooldowns[message.author.id] < 45:
            return
        self.cooldowns[message.author.id] = now
        # Replies are treated as helpful community participation and earn a
        # small bonus.  The cooldown keeps this from being farmable.
        amount = 8 if message.reference else 5
        xp, level = await self.bot.db.add_xp(message.author.id, amount)
        if level in REWARDS and xp % 100 < 5:
            role = discord.utils.get(message.guild.roles, name=REWARDS[level][2:])
            if role and isinstance(message.author, discord.Member):
                await message.author.add_roles(role, reason=f"רמת EditIL {level}")
                await message.channel.send(f"🎉 {message.author.mention} הגיע/ה לרמה {level} וקיבל/ה **{REWARDS[level]}**!")


    @app_commands.command(name="profile", description="הצגת פרופיל העורך")
    async def profile(self, interaction: discord.Interaction, member: discord.Member | None = None) -> None:
        member = member or interaction.user
        row = await self.bot.db.fetchone("SELECT xp, edits, wins, software FROM profiles WHERE user_id = ?", (member.id,))
        xp, edits, wins, software = row or (0, 0, 0, "לא נבחר")
        level = xp // 100
        description = (f"**שם משתמש:** {member.mention}\n**רמה:** {level} ({xp} XP)\n"
                       f"**תוכנה:** {software}\n**עריכות שפורסמו:** {edits}\n"
                       f"**ניצחונות בתחרויות:** {wins}\n**תאריך הצטרפות:** <t:{int(member.joined_at.timestamp())}:D>")
        await interaction.response.send_message(embed=embed("🎬 פרופיל עורך", description, PURPLE))

    @app_commands.command(name="rank", description="הצגת הרמה וה־XP")
    async def rank(self, interaction: discord.Interaction, member: discord.Member | None = None) -> None:
        member = member or interaction.user
        row = await self.bot.db.fetchone("SELECT xp FROM profiles WHERE user_id = ?", (member.id,))
        xp = row[0] if row else 0
        await interaction.response.send_message(embed=embed("📈 דירוג", f"{member.mention}\n**רמה:** {xp // 100}\n**XP:** {xp}\n**לרמה הבאה:** {100 - xp % 100}", PURPLE))

    @app_commands.command(name="leaderboard", description="טבלת מובילי XP")
    async def leaderboard(self, interaction: discord.Interaction) -> None:
        rows = await self.bot.db.fetchall("SELECT user_id, xp FROM profiles ORDER BY xp DESC LIMIT 10")
        lines = [f"**{index}.** <@{user_id}> — {xp} XP" for index, (user_id, xp) in enumerate(rows, 1)]
        await interaction.response.send_message(embed=embed("🏅 טבלת מובילים", "\n".join(lines) or "עדיין אין נתוני XP.", PURPLE))

    @app_commands.command(name="setxp", description="קביעת XP למשתמש")
    @app_commands.checks.has_permissions(manage_guild=True)
    async def setxp(self, interaction: discord.Interaction, member: discord.Member, amount: app_commands.Range[int, 0, 10_000_000]) -> None:
        await self.bot.db.execute("INSERT OR IGNORE INTO profiles (user_id) VALUES (?)", (member.id,))
        await self.bot.db.execute("UPDATE profiles SET xp = ? WHERE user_id = ?", (amount, member.id))
        await interaction.response.send_message(embed=success(f"ה־XP של {member.mention} נקבע ל־{amount}."), ephemeral=True)

    @app_commands.command(name="resetxp", description="איפוס XP למשתמש")
    @app_commands.checks.has_permissions(manage_guild=True)
    async def resetxp(self, interaction: discord.Interaction, member: discord.Member) -> None:
        await self.bot.db.execute("INSERT OR IGNORE INTO profiles (user_id) VALUES (?)", (member.id,))
        await self.bot.db.execute("UPDATE profiles SET xp = 0 WHERE user_id = ?", (member.id,))
        await interaction.response.send_message(embed=success(f"ה־XP של {member.mention} אופס."), ephemeral=True)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Levels(bot))
