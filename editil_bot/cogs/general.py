from __future__ import annotations

import discord
from discord import app_commands
from discord.ext import commands

from ..embeds import BLUE, embed


CATEGORIES = {
    "כללי": {"help", "ping", "botinfo", "serverinfo", "userinfo", "avatar"},
    "קהילה": {"suggest", "report", "feedback", "poll", "roles", "rolepanel", "showcase", "contest"},
    "רמות": {"rank", "profile", "leaderboard"},
    "כרטיסים": {"ticket", "close", "transcript", "add", "remove"},
    "ניהול": {"warn", "warnings", "clearwarnings", "timeout", "kick", "ban", "unban", "clear", "lock", "unlock", "slowmode", "nick", "embed", "announce"},
    "הגדרות": {"setup", "settings", "reload", "sync", "debug"},
}


class General(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(name="help", description="הצגת הפקודות הזמינות")
    async def help(self, interaction: discord.Interaction) -> None:
        owner = bool(interaction.guild and interaction.user.id == interaction.guild.owner_id)
        roots = {command.name for command in self.bot.tree.get_commands()}
        lines = []
        for category, names in CATEGORIES.items():
            available = sorted(roots & names)
            if not owner:
                available = [name for name in available if name not in CATEGORIES["הגדרות"]]
            if available:
                lines.append(f"**{category}**\n" + " ".join(f"`/{name}`" for name in available))
        await interaction.response.send_message(embed=embed("📚 עזרה", "\n\n".join(lines), BLUE), ephemeral=True)

    @app_commands.command(name="ping", description="בדיקת זמן התגובה של הבוט")
    async def ping(self, interaction: discord.Interaction) -> None:
        await interaction.response.send_message(f"🏓 זמן תגובה: `{round(self.bot.latency * 1000)}ms`", ephemeral=True)

    @app_commands.command(name="botinfo", description="מידע על הבוט")
    async def botinfo(self, interaction: discord.Interaction) -> None:
        description = f"**שם:** {self.bot.user or 'EditIL Assistant'}\n**ספרייה:** discord.py `{discord.__version__}`\n**שרתים:** {len(self.bot.guilds)}\n**פקודות רשומות:** {self.bot.registered_command_count or len(self.bot.tree.get_commands())}"
        await interaction.response.send_message(embed=embed("🤖 מידע על הבוט", description))

    @app_commands.command(name="serverinfo", description="מידע על השרת")
    @app_commands.guild_only()
    async def serverinfo(self, interaction: discord.Interaction) -> None:
        guild = interaction.guild
        assert guild
        description = f"**שם:** {guild.name}\n**בעלים:** <@{guild.owner_id}>\n**חברים:** {guild.member_count}\n**ערוצים:** {len(guild.channels)}\n**נוצר:** <t:{int(guild.created_at.timestamp())}:D>"
        await interaction.response.send_message(embed=embed("ℹ️ מידע על השרת", description))

    @app_commands.command(name="userinfo", description="מידע על משתמש")
    @app_commands.guild_only()
    async def userinfo(self, interaction: discord.Interaction, member: discord.Member | None = None) -> None:
        member = member or interaction.user
        assert isinstance(member, discord.Member)
        description = f"**משתמש:** {member.mention}\n**מזהה:** `{member.id}`\n**הצטרף:** <t:{int(member.joined_at.timestamp())}:D>\n**נוצר:** <t:{int(member.created_at.timestamp())}:D>"
        await interaction.response.send_message(embed=embed("👤 מידע על משתמש", description))

    @app_commands.command(name="avatar", description="הצגת תמונת פרופיל")
    async def avatar(self, interaction: discord.Interaction, user: discord.User | None = None) -> None:
        user = user or interaction.user
        card = embed(f"🖼️ תמונת הפרופיל של {user}")
        card.set_image(url=user.display_avatar.url)
        await interaction.response.send_message(embed=card)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(General(bot))
