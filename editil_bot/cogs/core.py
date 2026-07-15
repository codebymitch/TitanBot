from __future__ import annotations

import discord
from discord import app_commands
from discord.ext import commands

from ..embeds import error
from ..logging import log


class Core(commands.Cog):
    """Cross-cutting Hebrew errors and private audit logging."""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_app_command_completion(self, interaction: discord.Interaction, command: app_commands.Command) -> None:
        if interaction.guild:
            await log(interaction.guild, self.bot.settings.log_channel_id, "⌨️ פקודה", f"{interaction.user.mention} הפעיל/ה `/{command.qualified_name}`.")

    @commands.Cog.listener()
    async def on_member_remove(self, member: discord.Member) -> None:
        await log(member.guild, self.bot.settings.log_channel_id, "📤 עזיבה", f"{member.mention} עזב/ה את השרת.")

    @commands.Cog.listener()
    async def on_member_update(self, before: discord.Member, after: discord.Member) -> None:
        before_roles = {role.id for role in before.roles}
        after_roles = {role.id for role in after.roles}
        if before_roles != after_roles:
            added = [role.mention for role in after.roles if role.id not in before_roles]
            removed = [role.mention for role in before.roles if role.id not in after_roles]
            changes = []
            if added:
                changes.append("נוסף: " + ", ".join(added))
            if removed:
                changes.append("הוסר: " + ", ".join(removed))
            await log(after.guild, self.bot.settings.log_channel_id, "🎭 שינוי תפקידים", f"{after.mention}\n" + "\n".join(changes))

    @commands.Cog.listener()
    async def on_app_command_error(self, interaction: discord.Interaction, exception: app_commands.AppCommandError) -> None:
        if isinstance(exception, app_commands.MissingPermissions):
            message = error("אין לך את ההרשאה הדרושה לפעולה זו.")
        elif isinstance(exception, app_commands.CommandOnCooldown):
            message = error("יש להמתין מעט לפני ניסיון נוסף.")
        else:
            message = error("אירעה שגיאה בעת ביצוע הפקודה. הצוות קיבל רישום על כך.")
            if interaction.guild:
                await log(interaction.guild, self.bot.settings.log_channel_id, "⚠️ שגיאת פקודה", f"פקודה: `/{interaction.command.qualified_name if interaction.command else 'לא ידוע'}`\nמשתמש: {interaction.user.mention}\nשגיאה: `{exception}`")
        if interaction.response.is_done():
            await interaction.followup.send(embed=message, ephemeral=True)
        else:
            await interaction.response.send_message(embed=message, ephemeral=True)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Core(bot))
