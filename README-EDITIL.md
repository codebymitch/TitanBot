# עורכי ישראל | EditIL

בוט Discord מקצועי לקהילת עורכי וידאו ישראלית, בנוי עם Python, `discord.py`, כפתורי UI ו־SQLite.

## הפעלה

1. התקינו Python 3.11 ומעלה.
2. צרו `.env.editil` על בסיס [`.env.editil.example`](.env.editil.example), והזינו את מזהי התפקידים והערוצים.
3. התקינו תלויות: `py -m pip install -r requirements-editil.txt`
4. הפעילו: `py -m editil_bot.main`

להפעלה עם Docker: `docker compose -f docker-compose.editil.yml up -d --build`.

הפעילו ב־Discord Developer Portal את **Server Members Intent** ואת **Message Content Intent**.

## ניהול

- `/panel roles` — פאנל בחירת תוכנות וסוגי עורכים.
- `/panel verify` — פאנל אימות חברי קהילה.
- `/tickets` — פאנל כרטיסי עזרה, דיווחים, שיתופי פעולה ובאגים.
- `/warn`, `/timeout`, `/kick`, `/ban`, `/clear` — כלי ניהול.
- `/showcase` — פרסום יצירה.
- `/profile` — פרופיל עורך.
- `/contest create`, `/contest submit`, `/contest vote` — תחרויות עריכה.

למערכת התפקידים, צרו בשרת תפקידים בעלי השמות המדויקים שמופיעים בפאנל. הגדירו את תפקידי `🆕 חדש`, `❤️ חבר קהילה` ו־`💎 Booster` באמצעות מזהי התפקידים בקובץ ההגדרות.
