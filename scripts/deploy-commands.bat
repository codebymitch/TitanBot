@echo off
REM Deploy Slash Commands Script for Windows
REM This registers all slash commands to your Discord guild

setlocal enabledelayedexpansion

if "%1"=="" (
    REM Try to get GUILD_ID from .env
    for /f "tokens=2 delims==" %%A in ('findstr /i "^GUILD_ID" .env') do set GUILD_ID=%%A
    if "!GUILD_ID!"=="" (
        echo.
        echo ❌ Error: GUILD_ID not provided
        echo.
        echo Usage: deploy-commands.bat ^<GUILD_ID^>
        echo   or add GUILD_ID to your .env file
        echo.
        exit /b 1
    )
) else (
    set GUILD_ID=%1
)

echo.
echo 🚀 Deploying slash commands to guild: !GUILD_ID!
echo.

node scripts/deploy-commands.js !GUILD_ID!

if errorlevel 1 (
    echo.
    echo ❌ Deploy failed. Check the errors above.
    exit /b 1
)

echo.
echo ✅ Commands deployed successfully!
echo Your /staff and /setup-mm commands should now appear in Discord.
echo.
pause
