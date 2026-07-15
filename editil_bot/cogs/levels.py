from __future__ import annotations

from collections import defaultdict

import discord
from discord import app_commands
from discord.ext import commands

from ..embeds import PURPLE, embed

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


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Levels(bot))
