/*
 * הגדרות Firebase — מערכת החשבונות והסנכרון של האתר.
 * כל עוד הערך הוא null, האתר עובד במצב מקומי (הנתונים נשמרים רק בדפדפן).
 *
 * איך ממלאים (פעם אחת, בחינם): ראו את ההוראות ב־README.md, סעיף "חשבונות משתמשים".
 * הערכים כאן אינם סודיים — Firebase מיועד שהם יופיעו בקוד של האתר. האבטחה נעשית בכללי Firestore (firestore.rules).
 *
 * דוגמה:
 * window.FIREBASE_CONFIG = {
 *   apiKey: "AIza...",
 *   authDomain: "my-daily-app.firebaseapp.com",
 *   projectId: "my-daily-app",
 *   storageBucket: "my-daily-app.appspot.com",
 *   messagingSenderId: "1234567890",
 *   appId: "1:1234567890:web:abc123"
 * };
 */
window.FIREBASE_CONFIG = null;
