from __future__ import annotations

import json

import aiosqlite


class Database:
    def __init__(self, path: str = "editil.db"):
        self.path = path
        self.connection: aiosqlite.Connection | None = None

    async def connect(self) -> None:
        self.connection = await aiosqlite.connect(self.path)
        await self.connection.executescript("""
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS profiles (user_id INTEGER PRIMARY KEY, xp INTEGER NOT NULL DEFAULT 0, edits INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, software TEXT NOT NULL DEFAULT 'לא נבחר');
        CREATE TABLE IF NOT EXISTS warnings (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id INTEGER, user_id INTEGER, moderator_id INTEGER, reason TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS tickets (channel_id INTEGER PRIMARY KEY, guild_id INTEGER, opener_id INTEGER, type TEXT, status TEXT DEFAULT 'open', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS contests (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id INTEGER, title TEXT, description TEXT, ends_at INTEGER, active INTEGER DEFAULT 1);
        CREATE TABLE IF NOT EXISTS submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, contest_id INTEGER, user_id INTEGER, url TEXT, UNIQUE(contest_id, user_id));
        CREATE TABLE IF NOT EXISTS votes (contest_id INTEGER, voter_id INTEGER, submission_id INTEGER, UNIQUE(contest_id, voter_id));
        CREATE TABLE IF NOT EXISTS guild_settings (
            guild_id INTEGER NOT NULL,
            setting_key TEXT NOT NULL,
            setting_value TEXT NOT NULL,
            PRIMARY KEY (guild_id, setting_key)
        );
        CREATE TABLE IF NOT EXISTS ticket_members (
            channel_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            PRIMARY KEY (channel_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS ticket_transcripts (
            channel_id INTEGER PRIMARY KEY,
            guild_id INTEGER NOT NULL,
            closed_by INTEGER NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        """)
        await self.connection.commit()

    async def close(self) -> None:
        if self.connection:
            await self.connection.close()

    async def execute(self, query: str, values: tuple = ()) -> aiosqlite.Cursor:
        assert self.connection
        cursor = await self.connection.execute(query, values)
        await self.connection.commit()
        return cursor

    async def fetchone(self, query: str, values: tuple = ()):
        assert self.connection
        cursor = await self.connection.execute(query, values)
        return await cursor.fetchone()

    async def fetchall(self, query: str, values: tuple = ()):
        assert self.connection
        cursor = await self.connection.execute(query, values)
        return await cursor.fetchall()

    async def get_guild_settings(self, guild_id: int) -> dict[str, object]:
        rows = await self.fetchall(
            "SELECT setting_key, setting_value FROM guild_settings WHERE guild_id = ?",
            (guild_id,),
        )
        result: dict[str, object] = {}
        for key, value in rows:
            try:
                result[key] = json.loads(value)
            except (TypeError, json.JSONDecodeError):
                result[key] = value
        return result

    async def get_guild_setting(self, guild_id: int, key: str, default=None):
        row = await self.fetchone(
            "SELECT setting_value FROM guild_settings WHERE guild_id = ? AND setting_key = ?",
            (guild_id, key),
        )
        if row is None:
            return default
        try:
            return json.loads(row[0])
        except (TypeError, json.JSONDecodeError):
            return row[0]

    async def set_guild_setting(self, guild_id: int, key: str, value: object) -> None:
        await self.execute(
            """INSERT INTO guild_settings (guild_id, setting_key, setting_value)
               VALUES (?, ?, ?)
               ON CONFLICT(guild_id, setting_key)
               DO UPDATE SET setting_value = excluded.setting_value""",
            (guild_id, key, json.dumps(value, ensure_ascii=False)),
        )

    async def reset_guild_settings(self, guild_id: int) -> None:
        await self.execute("DELETE FROM guild_settings WHERE guild_id = ?", (guild_id,))

    async def add_xp(self, user_id: int, amount: int = 5) -> tuple[int, int]:
        await self.execute("INSERT OR IGNORE INTO profiles (user_id) VALUES (?)", (user_id,))
        await self.execute("UPDATE profiles SET xp = xp + ? WHERE user_id = ?", (amount, user_id))
        row = await self.fetchone("SELECT xp FROM profiles WHERE user_id = ?", (user_id,))
        return row[0], row[0] // 100
