from __future__ import annotations

import discord
from discord import app_commands
from discord.ext import commands

from ..embeds import BLUE, PURPLE, embed, error, success
from ..logging import log

SOFTWARE = [("🎬", "After Effects"), ("✂️", "Premiere Pro"), ("📱", "CapCut"), ("🎨", "Photoshop"), ("🧊", "Blender"), ("🎥", "DaVinci Resolve")]
EDITOR_TYPES = [("🎬", "Video Editor"), ("📱", "TikTok Editor"), ("🎮", "Gaming Editor"), ("🎨", "Designer"), ("🎵", "Music Creator"), ("🌱", "Beginner Editor")]


class VerificationView(discord.ui.View):
    def __init__(self, cog: "Community"):
        super().__init__(timeout=None)
        self.cog = cog

    @discord.ui.button(label="אימות", emoji="✅", style=discord.ButtonStyle.success, custom_id="editil:verify")
    async def verify(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        if not interaction.guild or not isinstance(interaction.user, discord.Member):
            return
        settings = self.cog.bot.settings
        new_role = interaction.guild.get_role(settings.new_member_role_id)
        member_role = interaction.guild.get_role(settings.member_role_id)
        if member_role is None:
            await interaction.response.send_message(embed=error("תפקיד חבר קהילה לא הוגדר עדיין."), ephemeral=True)
            return
        if new_role:
            await interaction.user.remove_roles(new_role, reason="אימות משתמש")
        await interaction.user.add_roles(member_role, reason="אימות משתמש")
        await interaction.response.send_message(embed=success("האימות הושלם. ברוכים הבאים לקהילה!"), ephemeral=True)
        await log(interaction.guild, settings.log_channel_id, "✅ אימות", f"{interaction.user.mention} אימת/ה את חשבונו/ה.")


class RolePanel(discord.ui.View):
    def __init__(self, cog: "Community"):
        super().__init__(timeout=None)
        self.cog = cog
        self.add_item(RoleSelect("software", "תוכנת עריכה", SOFTWARE))
        self.add_item(RoleSelect("type", "סוג עורך", EDITOR_TYPES))


class RoleSelect(discord.ui.Select):
    def __init__(self, group: str, placeholder: str, roles: list[tuple[str, str]]):
        options = [discord.SelectOption(label=name, emoji=emoji, value=name) for emoji, name in roles]
        super().__init__(placeholder=placeholder, min_values=0, max_values=len(options), options=options, custom_id=f"editil:roles:{group}")
        self.group = group
        self.names = [name for _, name in roles]

    async def callback(self, interaction: discord.Interaction) -> None:
        assert interaction.guild and isinstance(interaction.user, discord.Member)
        managed = [role for role in interaction.guild.roles if role.name in self.names]
        selected = [role for role in interaction.guild.roles if role.name in self.values]
        if managed:
            await interaction.user.remove_roles(*managed, reason="עדכון תפקידי עריכה")
        if selected:
            await interaction.user.add_roles(*selected, reason="עדכון תפקידי עריכה")
        await interaction.response.send_message(embed=success("התפקידים שלך עודכנו."), ephemeral=True)


class WelcomeView(discord.ui.View):
    def __init__(self, cog: "Community"):
        super().__init__(timeout=None)
        self.cog = cog

    @discord.ui.button(label="חוקים", emoji="📜", style=discord.ButtonStyle.secondary, custom_id="editil:rules")
    async def rules(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        channel = interaction.guild and interaction.guild.get_channel(self.cog.bot.settings.rules_channel_id)
        text = channel.mention if isinstance(channel, discord.TextChannel) else "ערוץ החוקים עדיין לא הוגדר."
        await interaction.response.send_message(f"📜 החוקים נמצאים כאן: {text}", ephemeral=True)

    @discord.ui.button(label="תפקידים", emoji="🎭", style=discord.ButtonStyle.primary, custom_id="editil:welcome-roles")
    async def roles(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await interaction.response.send_message("🎭 בחרו את התפקידים המתאימים לכם:", view=RolePanel(self.cog), ephemeral=True)

    @discord.ui.button(label="התחילו לערוך", emoji="🎬", style=discord.ButtonStyle.success, custom_id="editil:start")
    async def start(self, interaction: discord.Interaction, _: discord.ui.Button) -> None:
        await interaction.response.send_message("🎬 התחילו בהיכרות, בחרו תפקידים ושתפו את העריכה הראשונה שלכם!", ephemeral=True)


class Community(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        bot.add_view(VerificationView(self))
        bot.add_view(RolePanel(self))
        bot.add_view(WelcomeView(self))

    @commands.Cog.listener()
    async def on_member_join(self, member: discord.Member) -> None:
        s = self.bot.settings
        new_role = member.guild.get_role(s.new_member_role_id)
        if new_role:
            await member.add_roles(new_role, reason="חבר חדש בקהילה")
        channel = member.guild.get_channel(s.welcome_channel_id)
        if isinstance(channel, discord.TextChannel):
            message = (f"🎬 ברוכים הבאים ל־**EditIL 🇮🇱**\n\nשלום {member.mention}!\n"
                       "אתם עכשיו חלק מקהילת העורכים הישראלית.\n\n"
                       "כדי להתחיל:\n📜 קראו חוקים\n🎭 בחרו תפקידים\n🎬 שתפו את היצירות שלכם")
            await channel.send(embed=embed("ברוכים הבאים", message, PURPLE), view=WelcomeView(self))
        await log(member.guild, s.log_channel_id, "📥 הצטרפות", f"{member.mention} הצטרף/ה לשרת.")

    @commands.Cog.listener()
    async def on_member_update(self, before: discord.Member, after: discord.Member) -> None:
        if before.premium_since is None and after.premium_since is not None:
            role = after.guild.get_role(self.bot.settings.booster_role_id)
            if role:
                await after.add_roles(role, reason="Discord Nitro Boost")
            channel = after.guild.get_channel(self.bot.settings.welcome_channel_id)
            if isinstance(channel, discord.TextChannel):
                await channel.send(embed=embed("💎 תודה על התמיכה ב־EditIL!", f"{after.mention}, קיבלתם את תפקיד ה־Booster והטבות בלעדיות.", PURPLE))

async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Community(bot))
