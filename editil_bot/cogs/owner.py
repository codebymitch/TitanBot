from __future__ import annotations

import logging
from typing import Literal

import discord
from discord import app_commands
from discord.ext import commands

from ..embeds import PURPLE, embed, error, success
from ..permissions import server_owner_only

logger = logging.getLogger(__name__)

CHANNEL_KEYS = {
    "welcome": "welcome_channel_id", "rules": "rules_channel_id", "verification": "verification_channel_id",
    "logs": "log_channel_id", "suggestions": "suggestions_channel_id", "reports": "reports_channel_id",
    "levels": "level_channel_id", "commands": "commands_channel_id",
}
ROLE_KEYS = {
    "verified": "verified_role_id", "helper": "helper_role_id", "moderator": "moderator_role_id",
    "administrator": "administrator_role_id", "ticket_staff": "ticket_staff_role_id",
    "booster": "booster_role_id", "level_reward": "level_reward_role_id",
}
MODULES = {"moderation", "leveling", "welcome", "verification", "tickets", "suggestions", "reports", "contests", "role_panels", "automod"}


class ResetView(discord.ui.View):
    def __init__(self, bot: commands.Bot, owner_id: int, guild_id: int):
        super().__init__(timeout=120)
        self.bot, self.owner_id, self.guild_id = bot, owner_id, guild_id

    @discord.ui.button(label="אישור איפוס הגדרות", style=discord.ButtonStyle.danger)
    async def confirm(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        if interaction.user.id != self.owner_id:
            await interaction.response.send_message(embed=error("רק בעל השרת יכול לאשר פעולה זו."), ephemeral=True)
            return
        await self.bot.db.reset_guild_settings(self.guild_id)
        button.disabled = True
        await interaction.response.edit_message(embed=success("ההגדרות אופסו. נתוני אזהרות, XP, תחרויות וכרטיסים נשמרו."), view=self)


class Owner(commands.Cog):
    settings_group = app_commands.Group(name="settings", description="ניהול הגדרות EditIL")

    def __init__(self, bot: commands.Bot): self.bot = bot

    @app_commands.command(name="setup", description="התחלת הגדרת הבוט")
    @server_owner_only()
    async def setup_command(self, interaction: discord.Interaction) -> None:
        await interaction.response.send_message(embed=embed("⚙️ הגדרה ראשונית", "השתמשו ב־`/settings channel` וב־`/settings role` עם בוחרי Discord, לאחר מכן בדקו את התוצאה ב־`/settings view`. ההגדרות נשמרות רק לאחר כל בחירה מפורשת ואינן יוצרות ערוצים או תפקידים כפולים.", PURPLE), ephemeral=True)

    @settings_group.command(name="view", description="הצגת ההגדרות הנוכחיות")
    @server_owner_only()
    async def settings_view(self, interaction: discord.Interaction) -> None:
        values = await self.bot.db.get_guild_settings(interaction.guild_id)
        items = []
        for label, key in {**CHANNEL_KEYS, **ROLE_KEYS}.items():
            value = int(values.get(key, 0) or 0)
            mention = f"<#{value}>" if key.endswith("channel_id") else f"<@&{value}>"
            items.append(f"**{label}:** {mention if value else 'לא הוגדר'}")
        modules = values.get("modules", {})
        items.append("**מודולים:** " + (", ".join(f"{k}={'פעיל' if v else 'כבוי'}" for k, v in modules.items()) or "ברירת מחדל"))
        items.append(f"**XP:** {values.get('xp_min', 5)}–{values.get('xp_max', 8)}, השהיה {values.get('xp_cooldown', 45)} שניות")
        await interaction.response.send_message(embed=embed("⚙️ הגדרות השרת", "\n".join(items), PURPLE), ephemeral=True)

    @settings_group.command(name="channel", description="הגדרת ערוץ")
    @server_owner_only()
    async def settings_channel(self, interaction: discord.Interaction, setting: Literal["welcome", "rules", "verification", "logs", "suggestions", "reports", "levels", "commands"], channel: discord.TextChannel) -> None:
        await self.bot.db.set_guild_setting(interaction.guild_id, CHANNEL_KEYS[setting], channel.id)
        await interaction.response.send_message(embed=success(f"הערוץ `{setting}` הוגדר ל־{channel.mention}."), ephemeral=True)

    @settings_group.command(name="role", description="הגדרת תפקיד")
    @server_owner_only()
    async def settings_role(self, interaction: discord.Interaction, setting: Literal["verified", "helper", "moderator", "administrator", "ticket_staff", "booster", "level_reward"], role: discord.Role) -> None:
        bot_member = interaction.guild.me
        if role >= bot_member.top_role:
            await interaction.response.send_message(embed=error("תפקיד הבוט נמוך מדי בהיררכיית התפקידים."), ephemeral=True)
            return
        await self.bot.db.set_guild_setting(interaction.guild_id, ROLE_KEYS[setting], role.id)
        await interaction.response.send_message(embed=success(f"התפקיד `{setting}` הוגדר ל־{role.mention}."), ephemeral=True)

    @settings_group.command(name="module", description="הפעלה או השבתה של מודול")
    @server_owner_only()
    async def settings_module(self, interaction: discord.Interaction, module: str, enabled: bool) -> None:
        module = module.casefold()
        if module not in MODULES:
            await interaction.response.send_message(embed=error("שם המודול אינו תקין."), ephemeral=True); return
        modules = await self.bot.db.get_guild_setting(interaction.guild_id, "modules", {})
        modules[module] = enabled
        await self.bot.db.set_guild_setting(interaction.guild_id, "modules", modules)
        await interaction.response.send_message(embed=success(f"המודול `{module}` {'הופעל' if enabled else 'הושבת'}. הנתונים שלו לא נמחקו."), ephemeral=True)

    @settings_group.command(name="levels", description="הגדרת צבירת XP")
    @server_owner_only()
    async def settings_levels(self, interaction: discord.Interaction, minimum: app_commands.Range[int, 0, 100], maximum: app_commands.Range[int, 1, 100], cooldown: app_commands.Range[int, 5, 3600]) -> None:
        if minimum > maximum:
            await interaction.response.send_message(embed=error("ערך ה־XP המינימלי לא יכול להיות גדול מהמקסימלי."), ephemeral=True); return
        for key, value in (("xp_min", minimum), ("xp_max", maximum), ("xp_cooldown", cooldown)):
            await self.bot.db.set_guild_setting(interaction.guild_id, key, value)
        await interaction.response.send_message(embed=success("הגדרות הרמות עודכנו."), ephemeral=True)

    @settings_group.command(name="command", description="הגדרת פקודה בודדת")
    @server_owner_only()
    async def settings_command(self, interaction: discord.Interaction, command: str, enabled: bool, cooldown: app_commands.Range[int, 0, 3600] = 0) -> None:
        command = command.lstrip("/").casefold()
        if command in {"settings", "help", "debug"} and not enabled:
            await interaction.response.send_message(embed=error("לא ניתן להשבית פקודת שחזור חיונית."), ephemeral=True); return
        config = await self.bot.db.get_guild_setting(interaction.guild_id, "commands", {})
        config[command] = {"enabled": enabled, "cooldown": cooldown}
        await self.bot.db.set_guild_setting(interaction.guild_id, "commands", config)
        await interaction.response.send_message(embed=success(f"הגדרת `/{command}` נשמרה."), ephemeral=True)

    @settings_group.command(name="reset", description="איפוס הגדרות השרת")
    @server_owner_only()
    async def settings_reset(self, interaction: discord.Interaction) -> None:
        await interaction.response.send_message(embed=error("האיפוס מוחק רק הגדרות. נתוני אזהרות, XP, תחרויות, תמלילים וכרטיסים יישמרו. אשרו כדי להמשיך."), view=ResetView(self.bot, interaction.user.id, interaction.guild_id), ephemeral=True)

    @app_commands.command(name="sync", description="סנכרון פקודות לשרת הנוכחי")
    @server_owner_only()
    async def sync(self, interaction: discord.Interaction) -> None:
        await interaction.response.defer(ephemeral=True)
        self.bot.validate_command_tree()
        guild = discord.Object(interaction.guild_id)
        self.bot.tree.copy_global_to(guild=guild)
        synced = await self.bot.tree.sync(guild=guild)
        self.bot.registered_command_count = len(synced)
        await interaction.followup.send(embed=success(f"נרשמו {len(synced)} פקודות לשרת. סנכרון לשרת מופיע בדרך כלל מהר יותר מסנכרון גלובלי."), ephemeral=True)

    @app_commands.command(name="reload", description="טעינה מחדש של מודול")
    @server_owner_only()
    async def reload(self, interaction: discord.Interaction, module: str) -> None:
        extension = f"editil_bot.cogs.{module.removesuffix('.py')}"
        if extension == __name__:
            await interaction.response.send_message(embed=error("לא ניתן לטעון מחדש את מודול הבעלים מתוך הפקודה עצמה."), ephemeral=True); return
        await interaction.response.defer(ephemeral=True)
        try:
            await self.bot.reload_extension(extension)
        except Exception:
            logger.exception("Failed to reload extension %s", extension)
            await interaction.followup.send(embed=error("טעינת המודול נכשלה. הפרטים המלאים נרשמו במסוף."), ephemeral=True); return
        await interaction.followup.send(embed=success(f"המודול `{module}` נטען מחדש."), ephemeral=True)

    @app_commands.command(name="debug", description="בדיקת תקינות הבוט")
    @server_owner_only()
    async def debug(self, interaction: discord.Interaction) -> None:
        guild = interaction.guild
        values = await self.bot.db.get_guild_settings(interaction.guild_id)
        missing_channels = [key for key in CHANNEL_KEYS.values() if not values.get(key)]
        missing_roles = [key for key in ROLE_KEYS.values() if not values.get(key)]
        me = guild.me
        needed = [name for name in ("send_messages", "embed_links", "read_message_history") if not getattr(me.guild_permissions, name)]
        description = f"**Latency:** {round(self.bot.latency * 1000)}ms\n**Database:** connected\n**Loaded modules:** {len(self.bot.loaded_modules)}\n**Failed modules:** {len(self.bot.failed_modules)}\n**Registered commands:** {self.bot.registered_command_count or len(self.bot.tree.get_commands())}\n**Missing channels:** {', '.join(missing_channels) or 'none'}\n**Missing roles:** {', '.join(missing_roles) or 'none'}\n**Missing permissions:** {', '.join(needed) or 'none'}\n**Last error:** {self.bot.last_error_reference or 'none'}"
        await interaction.response.send_message(embed=embed("🧪 Debug", description, PURPLE), ephemeral=True)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Owner(bot))
