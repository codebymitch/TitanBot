# Milano Roleplay Discord Bot

This repository contains the Milano Roleplay Discord bot, built with Node.js, discord.js, and PostgreSQL.

## Features

The bot supports moderation, tickets, applications, leveling, giveaways, birthdays, server statistics, reaction roles, search and utility tools, verification, welcome messages, and logging. Economy commands, fun/game commands, Join-to-Create voice-channel automation, and music playback have been removed.

## Setup

1. Install Node.js 20.10 or later and PostgreSQL.
2. Copy `.env.example` to `.env` and configure `DISCORD_TOKEN`, `CLIENT_ID`, and your PostgreSQL connection.
3. Install dependencies with `npm install`.
4. Start the bot with `npm start`.

For Docker deployment, configure `.env` and run `docker compose up -d --build`.

## Commands

Use `/help` in Discord to browse available commands. Slash commands are registered from the remaining command modules at startup.

## Support

Discord: https://discord.gg/mlroleplay
