import { chromium } from 'playwright-core';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputDir = resolve('tmp/tiktok-frames');
await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--disable-gpu', '--hide-scrollbars']
});
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.setContent(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;overflow:hidden;background:#050611;color:#fff;font-family:Arial,sans-serif}.stage{position:relative;width:1080px;height:1920px;overflow:hidden;background:radial-gradient(circle at 85% 8%,#12366f 0,transparent 33%),radial-gradient(circle at 5% 82%,#55153b 0,transparent 35%),#070916}.grid{position:absolute;inset:0;opacity:.14;background-image:linear-gradient(#fff1 1px,transparent 1px),linear-gradient(90deg,#fff1 1px,transparent 1px);background-size:80px 80px}.top{position:absolute;z-index:9;top:70px;right:70px;left:70px;display:flex;align-items:center;justify-content:space-between}.brand{display:flex;align-items:center;gap:18px;font-size:34px;font-weight:900}.brand img{width:70px;height:70px;border-radius:20px}.tag{padding:12px 20px;border:1px solid #fff3;border-radius:99px;color:#b9c4dd;font-size:19px}.scene{position:absolute;inset:210px 70px 210px;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;text-align:center}.scene small{color:#6fdfff;font-size:25px;font-weight:900;letter-spacing:.08em}.scene h1{margin:25px 0;font-size:105px;line-height:.95;letter-spacing:-6px}.scene h1 em{color:#ff55a9;font-style:normal}.scene p{max-width:780px;margin:0;color:#b5bdd2;font-size:30px;line-height:1.55}.logo{width:220px;height:220px;margin-bottom:45px;border:2px solid #62dfff77;border-radius:60px;box-shadow:0 0 0 22px #775cff18,0 0 0 44px #ff55a90e,0 40px 100px #0008}.logo img{width:100%;height:100%;border-radius:58px}.discord{width:900px;overflow:hidden;border:1px solid #fff2;border-radius:30px;background:#151821;box-shadow:0 45px 120px #0009;text-align:right}.discord header{padding:25px 32px;border-bottom:1px solid #fff1;background:#1d202b;font-size:27px;font-weight:900}.post{padding:30px;display:flex;gap:22px}.avatar{width:70px;height:70px;flex:0 0 70px;display:grid;place-items:center;border-radius:50%;background:linear-gradient(135deg,#2fa9d6,#725cff);font-size:28px;font-weight:900}.post section{flex:1}.post b{font-size:25px}.post p{margin:8px 0 20px;color:#d8dbe5;font-size:23px}.video{height:330px;display:grid;grid-template-columns:1.15fr .85fr;overflow:hidden;border:1px solid #fff2;border-radius:22px;background:#1c1f29}.thumb{position:relative;display:grid;place-items:center;background:radial-gradient(circle at 65% 30%,#298bcd88,transparent 40%),linear-gradient(145deg,#192b54,#67234d)}.play{width:100px;height:100px;display:grid;place-items:center;border-radius:50%;background:#080a14bb;font-size:38px}.meta{padding:40px;display:flex;flex-direction:column;justify-content:center}.meta strong{font-size:28px}.meta span{margin-top:10px;color:#8790a5;font-size:19px}.reactions{margin-top:17px;display:flex;gap:12px}.reaction{padding:12px 18px;border:1px solid #fff2;border-radius:14px;background:#242833;font-size:22px;transform:scale(0)}.reply{margin:0 30px 30px;padding:22px;display:flex;gap:18px;border-radius:18px;background:#1a1d27;opacity:0;transform:translateY(25px)}.reply p{margin:5px 0;color:#c8ccda;font-size:20px}.command{margin:28px 30px;padding:22px 28px;border-radius:16px;background:#252b43;color:#b9c8ff;font:26px monospace;text-align:right}.thinking{height:55px;color:#8e96aa;font-size:20px;opacity:0}.botreply{margin:0 30px 35px;padding:25px;display:flex;gap:20px;opacity:0;transform:translateY(25px)}.botreply img{width:72px;height:72px;border-radius:50%}.embed{flex:1;padding:26px;border-right:6px solid #5865f2;border-radius:10px;background:#20232d}.embed h2{margin:0 0 18px;font-size:30px}.rank{padding:12px 0;display:flex;justify-content:space-between;border-bottom:1px solid #fff1;font-size:22px}.rank b{color:#8db9ff}.cta{margin-top:45px;padding:25px 40px;border-radius:20px;background:linear-gradient(110deg,#3697ff,#765cff,#ff4fa7);font-size:30px;font-weight:900}.url{margin-top:30px;color:#fff;font:38px monospace;font-weight:900}.progress{position:absolute;z-index:9;right:70px;bottom:85px;left:70px;height:8px;border-radius:8px;background:#fff2;overflow:hidden}.progress i{display:block;width:100%;height:100%;transform-origin:right;background:linear-gradient(90deg,#43e7ff,#765cff,#ff4fa7)}.footer{position:absolute;z-index:9;bottom:115px;right:70px;left:70px;display:flex;justify-content:space-between;color:#7e879f;font-size:18px}
</style></head><body><main class="stage"><div class="grid"></div><header class="top"><div class="brand"><img src="https://cdn.discordapp.com/icons/1526671786387705907/d2dae6973a167f36b79f04bd4c769fed.webp?size=128">EditIL</div><span class="tag">קהילת העורכים בישראל</span></header>
<section class="scene intro"><div class="logo"><img src="https://cdn.discordapp.com/icons/1526671786387705907/d2dae6973a167f36b79f04bd4c769fed.webp?size=256"></div><small>קהילת העורכים בישראל</small><h1>הרעיון הבא שלכם<br><em>מתחיל כאן.</em></h1><p>משתפים עריכות, מקבלים משוב ומתקדמים עם יוצרים שמבינים אתכם.</p></section>
<section class="scene community"><small>ככה זה מרגיש בפנים</small><h1>מעלים יצירה.<br><em>הקהילה מגיבה.</em></h1><div class="discord"><header>#　שיתוף־עריכות</header><article class="post"><div class="avatar">N</div><section><b>נועם</b><p>סיימתי עריכת גיימינג חדשה — מה דעתכם?</p><div class="video"><div class="thumb"><div class="play">▶</div></div><div class="meta"><strong>העריכה החדשה שלי</strong><span>After Effects • Gaming Edit</span></div></div><div class="reactions"><span class="reaction">🔥 18</span><span class="reaction">✨ 12</span><span class="reaction">🎬 7</span></div></section></article><article class="reply"><div class="avatar">D</div><div><b>דניאל</b><p>הסנכרון מעולה 🔥 הייתי מקצר קצת את הפתיח.</p></div></article></div></section>
<section class="scene bot"><small>והבוט תמיד שם</small><h1>פקודה אחת.<br><em>תשובה מיידית.</em></h1><div class="discord"><header>#　פקודות־הבוט</header><div class="command">/leaderboard</div><div class="thinking">EditIL Assistant חושב •••</div><div class="botreply"><img src="https://cdn.discordapp.com/icons/1526671786387705907/d2dae6973a167f36b79f04bd4c769fed.webp?size=128"><div class="embed"><h2>🏆 מובילי הקהילה</h2><div class="rank"><span>1　נועם</span><b>רמה 24</b></div><div class="rank"><span>2　דניאל</span><b>רמה 21</b></div><div class="rank"><span>3　מאיה</span><b>רמה 19</b></div></div></div></div></section>
<section class="scene final"><small>הפריים הבא מחכה לכם</small><h1>מוכנים ליצור<br><em>ביחד?</em></h1><p>הצטרפו לקהילת עורכי הווידאו של ישראל.</p><div class="cta">הצטרפו עכשיו ל־Discord</div><div class="url">editil.com</div></section>
<div class="footer"><span>EDITIL.COM</span><span>18 שניות של יצירה</span></div><div class="progress"><i></i></div></main>
<script>
window.renderAt=(t)=>{
 const scenes=[...document.querySelectorAll('.scene')], cuts=[0,3.5,8.5,13.5,18];
 let idx=t<3.5?0:t<8.5?1:t<13.5?2:3;
 scenes.forEach((s,i)=>{const start=cuts[i],end=cuts[i+1],p=Math.max(0,Math.min(1,(t-start)/(end-start))),fade=Math.min(1,p*6,(1-p)*7);s.style.opacity=i===idx?fade:0;s.style.transform=i===idx?\`scale(\${.96+p*.04}) translateY(\${(1-p)*22}px)\`:'scale(.96)'});
 document.querySelector('.progress i').style.transform=\`scaleX(\${Math.min(1,t/18)})\`;
 document.querySelectorAll('.reaction').forEach((e,i)=>{const p=Math.max(0,Math.min(1,(t-(6+i*.25))/.25));e.style.transform=\`scale(\${p})\`});
 const reply=document.querySelector('.reply'),rp=Math.max(0,Math.min(1,(t-7)/.35));reply.style.opacity=rp;reply.style.transform=\`translateY(\${(1-rp)*25}px)\`;
 const think=document.querySelector('.thinking');think.style.opacity=t>11.1&&t<12?1:0;
 const br=document.querySelector('.botreply'),bp=Math.max(0,Math.min(1,(t-12)/.4));br.style.opacity=bp;br.style.transform=\`translateY(\${(1-bp)*25}px)\`;
};</script></body></html>`);
await page.waitForLoadState('networkidle');

const fps = 24;
const seconds = 18;
for (let frame = 0; frame < fps * seconds; frame += 1) {
  await page.evaluate(time => window.renderAt(time), frame / fps);
  await page.screenshot({
    path: resolve(outputDir, `frame-${String(frame).padStart(4, '0')}.jpg`),
    type: 'jpeg',
    quality: 88
  });
}
await browser.close();
console.log(`${fps * seconds} frames written to ${outputDir}`);
