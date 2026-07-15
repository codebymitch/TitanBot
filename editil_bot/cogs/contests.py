from __future__ import annotations

import time
from urllib.parse import urlparse

import discord
from discord import app_commands
from discord.ext import commands

from ..embeds import PURPLE, error, success, embed
from ..logging import log


class Contests(commands.Cog):
    contest = app_commands.Group(name="contest", description="תחרויות עריכה של EditIL")

    def __init__(self, bot: commands.Bot): self.bot = bot

    @contest.command(name="create", description="יצירת תחרות עריכה")
    @app_commands.checks.has_permissions(manage_guild=True)
    async def create(self, interaction: discord.Interaction, title: str, description: str, days: app_commands.Range[int, 1, 30] = 7) -> None:
        ends = int(time.time()) + days * 86400
        cursor = await self.bot.db.execute("INSERT INTO contests (guild_id, title, description, ends_at) VALUES (?, ?, ?, ?)", (interaction.guild_id, title, description, ends))
        await interaction.response.send_message(embed=embed("🏆 תחרות עריכה חדשה", f"**{title}**\n{description}\n\nהגשות פתוחות עד <t:{ends}:R>.\nמזהה תחרות: `{cursor.lastrowid}`", PURPLE))
        await log(interaction.guild, self.bot.settings.log_channel_id, "🏆 תחרות נוצרה", f"{interaction.user.mention} יצר/ה את {title}.")

    @contest.command(name="submit", description="הגשת עריכה לתחרות")
    async def submit(self, interaction: discord.Interaction, contest_id: int, link: str) -> None:
        parsed = urlparse(link)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            await interaction.response.send_message(embed=error("יש לשלוח קישור תקין להגשה."), ephemeral=True)
            return
        contest = await self.bot.db.fetchone("SELECT title, ends_at, active FROM contests WHERE id = ? AND guild_id = ?", (contest_id, interaction.guild_id))
        if not contest or not contest[2] or contest[1] < time.time():
            await interaction.response.send_message(embed=error("לא נמצאה תחרות פעילה עם מזהה זה."), ephemeral=True)
            return
        try:
            await self.bot.db.execute("INSERT INTO submissions (contest_id, user_id, url) VALUES (?, ?, ?)", (contest_id, interaction.user.id, link))
        except Exception:
            await interaction.response.send_message(embed=error("כבר שלחתם הגשה לתחרות זו."), ephemeral=True)
            return
        await interaction.response.send_message(embed=success(f"ההגשה לתחרות **{contest[0]}** נקלטה."), ephemeral=True)

    @contest.command(name="vote", description="הצבעה להגשה בתחרות")
    async def vote(self, interaction: discord.Interaction, contest_id: int, submission_id: int) -> None:
        submitted = await self.bot.db.fetchone("SELECT user_id FROM submissions WHERE id = ? AND contest_id = ?", (submission_id, contest_id))
        if not submitted or submitted[0] == interaction.user.id:
            await interaction.response.send_message(embed=error("הגשה לא נמצאה או שלא ניתן להצביע לעצמכם."), ephemeral=True)
            return
        try:
            await self.bot.db.execute("INSERT INTO votes (contest_id, voter_id, submission_id) VALUES (?, ?, ?)", (contest_id, interaction.user.id, submission_id))
        except Exception:
            await interaction.response.send_message(embed=error("כבר הצבעתם בתחרות הזו."), ephemeral=True)
            return
        await interaction.response.send_message(embed=success("ההצבעה שלך נשמרה!"), ephemeral=True)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Contests(bot))
