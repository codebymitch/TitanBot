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
        await self.cog.close_ticket(interaction)


class Tickets(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        bot.add_view(TicketView(self))
        bot.add_view(CloseTicketView(self))

    async def _ticket_row(self, interaction: discord.Interaction):
        if not interaction.channel:
            return None
        return await self.bot.db.fetchone("SELECT opener_id FROM tickets WHERE channel_id = ? AND status = 'open'", (interaction.channel.id,))

    async def _is_staff(self, interaction: discord.Interaction) -> bool:
        if not interaction.guild or not isinstance(interaction.user, discord.Member): return False
        role_id = int(await self.bot.db.get_guild_setting(interaction.guild_id, "ticket_staff_role_id", self.bot.settings.ticket_staff_role_id) or 0)
        return interaction.user.guild_permissions.manage_channels or bool(role_id and interaction.user.get_role(role_id))

    async def close_ticket(self, interaction: discord.Interaction) -> None:
        if not isinstance(interaction.channel, discord.TextChannel) or not interaction.guild:
            return
        row = await self._ticket_row(interaction)
        if not row:
            await interaction.response.send_message("זה אינו כרטיס פעיל.", ephemeral=True)
            return
        if interaction.user.id != row[0] and not await self._is_staff(interaction):
            await interaction.response.send_message(embed=error("רק פותח הכרטיס או הצוות יכולים לסגור אותו."), ephemeral=True)
            return
        await interaction.response.defer()
        messages = [f"[{m.created_at:%Y-%m-%d %H:%M}] {m.author}: {m.clean_content}" async for m in interaction.channel.history(limit=None, oldest_first=True)]
        content = "\n".join(messages)
        transcript = discord.File(io.BytesIO(content.encode("utf-8")), filename=f"ticket-{interaction.channel.id}.txt")
        log_id = int(await self.bot.db.get_guild_setting(interaction.guild_id, "log_channel_id", self.bot.settings.log_channel_id) or 0)
        log_channel = interaction.guild.get_channel(log_id)
        if isinstance(log_channel, discord.TextChannel):
            await log_channel.send(embed=embed("🔒 כרטיס נסגר", f"נסגר על ידי {interaction.user.mention}.\nערוץ: {interaction.channel.name}", PURPLE), file=transcript)
        await self.bot.db.execute("INSERT OR REPLACE INTO ticket_transcripts (channel_id, guild_id, closed_by, content) VALUES (?, ?, ?, ?)", (interaction.channel.id, interaction.guild.id, interaction.user.id, content))
        await self.bot.db.execute("UPDATE tickets SET status = 'closed' WHERE channel_id = ?", (interaction.channel.id,))
        await interaction.channel.delete(reason=f"Ticket closed by {interaction.user}")

    @app_commands.command(name="ticket", description="פתיחת לוח כרטיסים")
    async def ticket(self, interaction: discord.Interaction) -> None:
        await interaction.response.send_message(embed=embed("🎫 פתיחת כרטיס", "בחרו את סוג הכרטיס המבוקש.", PURPLE), view=TicketView(self), ephemeral=True)

    @app_commands.command(name="close", description="סגירת הכרטיס הנוכחי")
    async def close_command(self, interaction: discord.Interaction) -> None:
        await self.close_ticket(interaction)

    @app_commands.command(name="transcript", description="יצירת תמליל של הכרטיס")
    async def transcript(self, interaction: discord.Interaction) -> None:
        if not await self._ticket_row(interaction) or not await self._is_staff(interaction):
            await interaction.response.send_message(embed=error("הפקודה זמינה לצוות בתוך כרטיס פעיל בלבד."), ephemeral=True); return
        await interaction.response.defer(ephemeral=True)
        messages = [f"[{m.created_at:%Y-%m-%d %H:%M}] {m.author}: {m.clean_content}" async for m in interaction.channel.history(limit=None, oldest_first=True)]
        file = discord.File(io.BytesIO("\n".join(messages).encode("utf-8")), filename=f"ticket-{interaction.channel.id}.txt")
        await interaction.followup.send(file=file, ephemeral=True)

    @app_commands.command(name="add", description="הוספת משתמש לכרטיס")
    async def add(self, interaction: discord.Interaction, member: discord.Member) -> None:
        if not await self._ticket_row(interaction) or not await self._is_staff(interaction):
            await interaction.response.send_message(embed=error("הפקודה זמינה לצוות בתוך כרטיס פעיל בלבד."), ephemeral=True); return
        await interaction.channel.set_permissions(member, view_channel=True, send_messages=True, read_message_history=True)
        await self.bot.db.execute("INSERT OR IGNORE INTO ticket_members (channel_id, user_id) VALUES (?, ?)", (interaction.channel.id, member.id))
        await interaction.response.send_message(embed=success(f"{member.mention} נוסף לכרטיס."), ephemeral=True)

    @app_commands.command(name="remove", description="הסרת משתמש מכרטיס")
    async def remove(self, interaction: discord.Interaction, member: discord.Member) -> None:
        if not await self._ticket_row(interaction) or not await self._is_staff(interaction):
            await interaction.response.send_message(embed=error("הפקודה זמינה לצוות בתוך כרטיס פעיל בלבד."), ephemeral=True); return
        await interaction.channel.set_permissions(member, overwrite=None)
        await self.bot.db.execute("DELETE FROM ticket_members WHERE channel_id = ? AND user_id = ?", (interaction.channel.id, member.id))
        await interaction.response.send_message(embed=success(f"{member.mention} הוסר מהכרטיס."), ephemeral=True)

async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Tickets(bot))
