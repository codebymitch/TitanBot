import { chromium } from 'playwright-core';
import { mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const output = resolve('exports/YouTube-Style-Hebrew-Overlays');
await mkdir(output, { recursive: true });

const variants = [
  { file: '01-subscribe', label: 'EditIL', detail: '@EditIL • קהילת העורכים בישראל', action: 'הרשמה', type: 'subscribe', a: '#ff0033', b: '#ff0033' },
  { file: '02-like', label: 'אהבתם את הסרטון?', detail: 'תנו לייק כדי לעזור לערוץ', action: 'לייק', type: 'like', a: '#0f0f0f', b: '#3f3f3f' },
  { file: '03-notifications', label: 'הפעילו התראות', detail: 'בחרו ״הכול״ כדי לא לפספס סרטון', action: 'הכול', type: 'bell', a: '#0f0f0f', b: '#3f3f3f' },
  { file: '04-discord', label: 'קהילת EditIL בדיסקורד', detail: 'קישור ההצטרפות נמצא בתיאור', action: 'הצטרפות', type: 'discord', a: '#5865f2', b: '#5865f2' },
  { file: '05-all-actions', label: 'נהניתם מהסרטון?', detail: 'הירשמו • תנו לייק • הפעילו התראות', action: 'הרשמה', type: 'all', a: '#ff0033', b: '#ff0033' },
];

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});

const html = `<!doctype html><meta charset="utf-8"><style>
html,body,canvas{margin:0;width:100%;height:100%;overflow:hidden;background:#00ff00}
</style><canvas width="1920" height="1080"></canvas><script>
const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');
const cfg=JSON.parse(decodeURIComponent(location.hash.slice(1)));
const W=1920,H=1080,D=6,FPS=30;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const ease=v=>1-Math.pow(1-clamp(v),3);
const back=v=>{v=clamp(v);const c=1.70158;return 1+(c+1)*Math.pow(v-1,3)+c*Math.pow(v-1,2)};
const lerp=(a,b,t)=>a+(b-a)*t;
const rounded=(x,y,w,h,r)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r)};
function hexAlpha(hex,a){const n=parseInt(hex.slice(1),16);return 'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+a+')'}
function discordIcon(x,y,s){
  ctx.save();ctx.translate(x,y);ctx.scale(s/128,s/96);ctx.fillStyle='#fff';ctx.beginPath();
  ctx.moveTo(108,8);ctx.bezierCurveTo(91,0,76,0,64,2);ctx.bezierCurveTo(52,0,37,0,20,8);
  ctx.bezierCurveTo(5,30,1,51,3,72);ctx.bezierCurveTo(20,85,35,90,48,92);
  ctx.lineTo(54,83);ctx.bezierCurveTo(46,81,39,77,33,73);ctx.lineTo(38,69);
  ctx.bezierCurveTo(55,77,73,77,90,69);ctx.lineTo(95,73);ctx.bezierCurveTo(89,77,82,81,74,83);
  ctx.lineTo(80,92);ctx.bezierCurveTo(93,90,108,85,125,72);ctx.bezierCurveTo(127,51,123,30,108,8);ctx.fill();
  ctx.fillStyle='#111525';ctx.beginPath();ctx.ellipse(43,47,12,15,0,0,Math.PI*2);ctx.ellipse(85,47,12,15,0,0,Math.PI*2);ctx.fill();ctx.restore();
}
function drawIcon(type,x,y,size,t,clicked){
  ctx.save();ctx.translate(x,y);
  const pulse=1+Math.sin(t*5)*.035+(clicked?Math.sin(t*18)*.045:0);ctx.scale(pulse,pulse);
  if(type==='discord') discordIcon(-size/2,-size*.37,size);
  else {ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=(size*.72)+'px "Segoe UI Emoji",Arial';
    ctx.fillText(type==='subscribe'?'▶':type==='like'?'👍':type==='bell'?'🔔':'✨',0,0)}
  ctx.restore();
}
function particle(x,y,i,p,c){
  const ang=i*.88+1.2,dist=ease(p)*(85+(i%4)*24),r=(i%3+1)*5*(1-p);
  ctx.fillStyle=i%2?c:'#fff';ctx.globalAlpha=1-p;ctx.beginPath();ctx.arc(x+Math.cos(ang)*dist,y+Math.sin(ang)*dist,r,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
}
function frame(ms){
  const t=ms/1000;
  ctx.fillStyle='#00ff00';ctx.fillRect(0,0,W,H);
  const intro=back(t/.75),out=ease((t-5.25)/.6),visible=clamp(intro-out);
  const baseY=765+(1-visible)*230,scale=.86+.14*visible;
  const click=ease((t-2.35)/.25),release=ease((t-2.65)/.25),press=click-release;
  const x=960,y=baseY,w=1280,h=238;
  ctx.save();ctx.translate(x,y);ctx.scale(scale*(1-press*.025),scale*(1-press*.025));ctx.translate(-x,-y);
  ctx.shadowColor='rgba(0,0,0,.32)';ctx.shadowBlur=42;ctx.shadowOffsetY=18;
  ctx.fillStyle='#ffffff';rounded(x-w/2,y-h/2,w,h,34);ctx.fill();ctx.shadowColor='transparent';
  ctx.lineWidth=2;ctx.strokeStyle='#dedede';ctx.stroke();
  const sweep=((t*.34)%1)*w*1.7-w*.3;ctx.save();rounded(x-w/2,y-h/2,w,h,64);ctx.clip();
  const shine=ctx.createLinearGradient(x-w/2+sweep,0,x-w/2+sweep+260,0);shine.addColorStop(0,'transparent');shine.addColorStop(.5,'rgba(255,0,51,.07)');shine.addColorStop(1,'transparent');
  ctx.fillStyle=shine;ctx.fillRect(x-w/2,y-h/2,w,h);ctx.restore();
  const iconX=x+w/2-125,iconY=y;ctx.fillStyle=cfg.type==='discord'?'#5865f2':'#ff0033';ctx.shadowColor='rgba(0,0,0,.16)';ctx.shadowBlur=18;
  ctx.beginPath();ctx.arc(iconX,iconY,78,0,Math.PI*2);ctx.fill();ctx.shadowColor='transparent';
  if(cfg.type==='discord') drawIcon('discord',iconX,iconY,126,t,click>.5); else {
    ctx.save();ctx.translate(iconX,iconY);ctx.scale(1+Math.sin(t*5)*.025,1+Math.sin(t*5)*.025);
    ctx.fillStyle='#fff';rounded(-42,-29,84,58,17);ctx.fill();ctx.fillStyle='#ff0033';ctx.beginPath();ctx.moveTo(-10,-18);ctx.lineTo(25,0);ctx.lineTo(-10,18);ctx.closePath();ctx.fill();ctx.restore();
  }
  const textIn=ease((t-.35)/.7);ctx.globalAlpha=textIn;ctx.direction='rtl';ctx.textAlign='right';ctx.fillStyle='#0f0f0f';
  ctx.font='900 55px Arial';ctx.fillText(cfg.label,x+w/2-245+(1-textIn)*80,y-18);
  ctx.fillStyle='#606060';ctx.font='500 28px Arial';ctx.fillText(cfg.detail,x+w/2-245+(1-textIn)*110,y+42);ctx.globalAlpha=1;
  const bx=x-w/2+185,by=y,bw=290,bh=92;ctx.fillStyle=click>.5?'#e5e5e5':cfg.a;ctx.shadowColor='rgba(0,0,0,.12)';ctx.shadowBlur=16;
  rounded(bx-bw/2,by-bh/2,bw,bh,46);ctx.fill();ctx.shadowColor='transparent';
  ctx.fillStyle=click>.5?'#0f0f0f':'#fff';ctx.textAlign='center';ctx.font='900 31px Arial';ctx.fillText(click>.5?(cfg.type==='like'?'אהבתי!':cfg.type==='bell'?'כל ההתראות':cfg.type==='subscribe'?'נרשמת!':cfg.type==='discord'?'נפגש בשרת!':'נרשמת!'):cfg.action,bx,by+11);
  if(click>.1&&click<1.45)for(let i=0;i<16;i++)particle(bx,by,i,clamp((t-2.45)/.85),i%2?cfg.a:cfg.b);
  ctx.restore();
  // Animated mouse cursor approaches and clicks the button.
  const cp=ease((t-1.05)/1.15),cx=lerp(460,bx+35,cp),cy=lerp(1000,by+22,cp)+Math.sin(t*4)*4;
  if(t>1&&t<3.35){ctx.save();ctx.translate(cx,cy);ctx.rotate(-.15);ctx.fillStyle='#fff';ctx.strokeStyle='#101321';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(4,67);ctx.lineTo(22,50);ctx.lineTo(39,83);ctx.lineTo(58,73);ctx.lineTo(40,42);ctx.lineTo(67,40);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore()}
  // Floating micro-elements keep the whole overlay alive without heavy effects.
  for(let i=0;i<8;i++){const a=t*.55+i*.8;ctx.globalAlpha=.35+.2*Math.sin(a*2);ctx.fillStyle=i%2?cfg.a:cfg.b;ctx.beginPath();ctx.arc(350+i*165+Math.sin(a)*18,620+Math.cos(a*1.3)*20,4+(i%3),0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1;
  if(ms<D*1000)requestAnimationFrame(frame);
}
async function record(){
  const stream=canvas.captureStream(FPS),rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:12000000}),chunks=[];
  rec.ondataavailable=e=>e.data.size&&chunks.push(e.data);const done=new Promise(r=>rec.onstop=r);
  rec.start(250);requestAnimationFrame(frame);setTimeout(()=>rec.stop(),D*1000+120);await done;
  const blob=new Blob(chunks,{type:'video/webm'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=cfg.file+'.webm';a.click();
}
record();
</script>`;

for (const item of variants) {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
  await page.goto(`data:text/html,${encodeURIComponent(html)}#${encodeURIComponent(JSON.stringify(item))}`);
  const download = await downloadPromise;
  const webm = resolve(output, `${item.file}.webm`);
  await download.saveAs(webm);
  await context.close();

  const mp4 = resolve(output, `${item.file}.mp4`);
  const tempIn = `/tmp/${item.file}.webm`;
  const tempOut = `/tmp/${item.file}.mp4`;
  spawnSync('docker', ['cp', webm, `titanbot:${tempIn}`], { stdio: 'inherit' });
  const encode = spawnSync('docker', ['exec', 'titanbot', 'ffmpeg', '-loglevel', 'error', '-y', '-i', tempIn,
    '-vf', 'fps=30,format=yuv420p', '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-movflags', '+faststart', tempOut], { encoding: 'utf8' });
  if (encode.status !== 0) throw new Error(encode.stderr);
  spawnSync('docker', ['cp', `titanbot:${tempOut}`, mp4], { stdio: 'inherit' });
  await rm(webm);
}
await browser.close();

await writeFile(resolve(output, 'README.txt'), `EditIL YouTube-Style Hebrew Overlay Pack

1920×1080 • 30 FPS • 6 seconds • Green-screen MP4

01 — Subscribe: הירשמו לערוץ
02 — Like: אהבתם את הסרטון?
03 — Notifications: הפעילו התראות
04 — Discord: הצטרפו לקהילה
05 — Combined CTA: רוצים עוד תוכן?

YouTube-inspired interface with an animated channel avatar, Hebrew labels,
button press, cursor, particles, shimmer, micro-motion, and animated exit.

Remove the #00FF00 background with Chroma Key / Keylight.
`, 'utf8');

console.log(output);
