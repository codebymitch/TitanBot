from __future__ import annotations

import io

import discord
from discord import app_commands
from discord.ext import commands

from ..embeds import PURPLE, embed, error, success
from ..logging import log


class TicketView(discord.ui.View):
    def __init__(self, cog: "Tickets"):
        super().__init__(timeout=None)
        self.cog = cog

    async def open_ticket(self, interaction: discord.Interaction, kind: str) -> None:
        if not interaction.guild or not isinstance(interaction.user, discord.Member):
            return
        s = self.cog.bot.settings
        category = interaction.guild.get_channel(s.ticket_category_id)
        if not isinstance(category, discord.CategoryChannel):
            await interaction.response.send_message(embed=error("קטגוריית הכרטיסים לא הוגדרה."), ephemeral=True)
            return
        existing = await self.cog.bot.db.fetchone("SELECT channel_id FROM tickets WHERE guild_id = ? AND opener_id = ? AND status = 'open'", (interaction.guild.id, interaction.user.id))
        if existing:
            await interaction.response.send_message("כבר פתוח עבורך כרטיס פעיל.", ephemeral=True)
            return
        overwrites = {interaction.guild.default_role: discord.PermissionOverwrite(view_channel=False), interaction.user: discord.PermissionOverwrite(view_channel=True, send_messages=True, read_message_history=True)}
        staff = interaction.guild.get_role(s.ticket_staff_role_id)
        if staff:
            overwrites[staff] = discord.PermissionOverwrite(view_channel=True, send_messages=True, read_message_history=True)
        channel = await interaction.guild.create_text_channel(f"{kind.lower()}-{interaction.user.name}"[:90], category=category, overwrites=overwrites, topic=f"Ticket owner: {interaction.user.id}")
        await self.cog.bot.db.execute("INSERT INTO tickets (channel_id, guild_id, opener_id, type) VALUES (?, ?, ?, ?)", (channel.id, interaction.guild.id, interaction.user.id, kind))
        await channel.send(f"{interaction.user.mention} | <@&{s.ticket_staff_role_id}>" if s.ticket_staff_role_id else interaction.user.mention, embed=embed(f"{kind} | EditIL", "צוות הקהילה יענה בהקדם. פרטו את הבקשה בצורה ברורה.", PURPLE), view=CloseTicketView(self.cog))
        await interaction.response.send_message(embed=success(f"הכרטיס נפתח: {channel.mention}"), ephemeral=True)
        await log(interaction.guild, s.log_channel_id, "🎫 כרטיס חדש", f"{interaction.user.mention} פתח/ה כרטיס מסוג {kind}: {channel.mention}")

    @discord.ui.button(label="עזרה", emoji="🎫", style=discord.ButtonStyle.primary, custom_id="editil:ticket:help")
    async def help(self, interaction: discord.Interaction, _: discord.ui.Button) -> None: await self.open_ticket(interaction, "Help")
    @discord.ui.button(label="דיווח", emoji="🚨", style=discord.ButtonStyle.danger, custom_id="editil:ticket:report")
    async def report(self, interaction: discord.Interaction, _: discord.ui.Button) -> None: await self.open_ticket(interaction, "Report")
    @discord.ui.button(label="שיתוף פעולה", emoji="💼", style=discord.ButtonStyle.secondary, custom_id="editil:ticket:partnership")
    async def partnership(self, interaction: discord.Interaction, _: discord.ui.Button) -> None: await self.open_ticket(interaction, "Partnership")
    @discord.ui.button(label="דיווח באג", emoji="🛠️", style=discord.ButtonStyle.secondary, custom_id="editil:ticket:bug")
    async def bug(self, interaction: discord.Interaction, _: discord.ui.Button) -> None: await self.open_ticket(interaction, "Bug")


class CloseTicketView(discord.ui.View):
    def __init__(self, cog: "Tickets"):
        super().__init__(timeout=None)
        self.cog = cog

    @discord.ui.button(label="סגירת כרטיס", emoji="🔒", style=discord.ButtonStyle.danger, custom_id="editil:ticket:close")
    async def close(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        if not isinstance(interaction.channel, discord.TextChannel) or not interaction.guild:
            return
        row = await self.cog.bot.db.fetchone("SELECT opener_id FROM tickets WHERE channel_id = ? AND status = 'open'", (interaction.channel.id,))
        if not row:
            await interaction.response.send_message("זה אינו כרטיס פעיל.", ephemeral=True)
            return
        staff = interaction.guild.get_role(self.cog.bot.settings.ticket_staff_role_id)
        if interaction.user.id != row[0] and not (staff and staff in interaction.user.roles):
            await interaction.response.send_message(embed=error("רק פותח הכרטיס או הצוות יכולים לסגור אותו."), ephemeral=True)
            return
        await interaction.response.defer()
        messages = [f"[{m.created_at:%Y-%m-%d %H:%M}] {m.author}: {m.clean_content}" async for m in interaction.channel.history(limit=None, oldest_first=True)]
        transcript = discord.File(io.BytesIO("\n".join(messages).encode("utf-8")), filename=f"ticket-{interaction.channel.id}.txt")
        log_channel = interaction.guild.get_channel(self.cog.bot.settings.log_channel_id)
        if isinstance(log_channel, discord.TextChannel):
            await log_channel.send(embed=embed("🔒 כרטיס נסגר", f"נסגר על ידי {interaction.user.mention}.\nערוץ: {interaction.channel.name}", PURPLE), file=transcript)
        await self.cog.bot.db.execute("UPDATE tickets SET status = 'closed' WHERE channel_id = ?", (interaction.channel.id,))
        await interaction.channel.delete(reason=f"Ticket closed by {interaction.user}")


class Tickets(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        bot.add_view(TicketView(self))
        bot.add_view(CloseTicketView(self))

async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Tickets(bot))
