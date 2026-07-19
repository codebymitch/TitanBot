import { chromium } from 'playwright-core';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const output = resolve('exports/Isolated-Hebrew-CTA-Buttons');
await mkdir(output, { recursive: true });

const buttons = [
  { file: '01-subscribe-button', label: 'הרשמה', done: 'נרשמת!', icon: '', color: '#ffffff', text: '#0f0f0f' },
  { file: '02-like-button', label: 'לייק', done: 'אהבתי!', icon: '👍', color: '#ffffff', text: '#0f0f0f' },
  { file: '03-notifications-button', label: 'התראות', done: 'הופעלו!', icon: '🔔', color: '#ffffff', text: '#0f0f0f' },
  { file: '04-discord-button', label: 'הצטרפות', done: 'הצטרפת!', icon: 'discord', color: '#5865f2', text: '#ffffff' },
];

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});

const html = `<!doctype html><meta charset="utf-8"><style>html,body,canvas{margin:0;width:100%;height:100%;overflow:hidden;background:#00ff00}</style>
<canvas width="1920" height="1080"></canvas><script>
const c=document.querySelector('canvas'),x=c.getContext('2d'),cfg=JSON.parse(decodeURIComponent(location.hash.slice(1)));
const W=1920,H=1080,D=6,FPS=60,clamp=v=>Math.max(0,Math.min(1,v)),ease=v=>1-Math.pow(1-clamp(v),4);
const back=v=>{v=clamp(v);const q=1.70158;return 1+(q+1)*Math.pow(v-1,3)+q*Math.pow(v-1,2)};
const elastic=v=>v===0||v===1?v:Math.pow(2,-10*v)*Math.sin((v*10-.75)*(2*Math.PI/3))+1;
function round(a,b,w,h,r){x.beginPath();x.roundRect(a,b,w,h,r)}
function discord(cx,cy,s){const p=new Path2D('M40.575 0C39.9562 1.09866 39.4006 2.2352 38.8954 3.397C34.0967 2.67719 29.2096 2.67719 24.3982 3.397C23.9057 2.2352 23.3374 1.09866 22.7186 0C18.2104.770324 13.8157 2.12155 9.64839 4.02841C1.38951 16.2652-.845688 28.1863.265599 39.9432C5.10222 43.517 10.5197 46.2447 16.2909 47.9874C17.5916 46.2447 18.7407 44.3883 19.7257 42.4562C17.8568 41.7616 16.0509 40.8903 14.3208 39.88C14.7755 39.5517 15.2175 39.2107 15.6468 38.8824C25.7873 43.6559 37.5316 43.6559 47.6847 38.8824C48.1141 39.236 48.5561 39.577 49.0107 39.88C47.2806 40.9029 45.4748 41.7616 43.5931 42.4688C44.5781 44.4009 45.7273 46.2573 47.028 48C52.7991 46.2573 58.2167 43.5422 63.0533 39.9684C64.3666 26.3299 60.8055 14.5099 53.6452 4.04104C49.4905 2.13418 45.0959.782952 40.5876.0252565L40.575 0ZM21.1401 32.7072C18.0209 32.7072 15.4321 29.8785 15.4321 26.3804C15.4321 22.8824 17.9199 20.041 21.1275 20.041C24.3351 20.041 26.886 22.895 26.8354 26.3804C26.7849 29.8658 24.3224 32.7072 21.1401 32.7072ZM42.1788 32.7072C39.047 32.7072 36.4834 29.8785 36.4834 26.3804C36.4834 22.8824 38.9712 20.041 42.1788 20.041C45.3864 20.041 47.9246 22.895 47.8741 26.3804C47.8236 29.8658 45.3611 32.7072 42.1788 32.7072Z');x.save();x.translate(cx-s/2,cy-s*.375);x.scale(s/64,s/64);x.fillStyle='#fff';x.fill(p);x.restore()}
function frame(ms){
 const t=ms/1000;x.fillStyle='#00ff00';x.fillRect(0,0,W,H);
 const enter=elastic(clamp(t/.9)),leave=ease((t-5.18)/.68),vis=clamp(enter-leave),click=ease((t-2.35)/.14),release=ease((t-2.58)/.24),press=click-release;
 const hasIcon=!!cfg.icon,bw=hasIcon?390:300,bh=122,cx=960+(1-enter)*520-leave*620,cy=760+Math.sin(t*2.15)*3;
 const rot=(1-enter)*-.12+leave*.1,baseScale=(.58+.42*enter)*(1-press*.105)*(1-leave*.12);
 // Directional ghosting simulates AE-style motion blur during fast movement.
 const velocity=(1-enter)*95+leave*95;
 for(let g=4;g>0;g--){x.save();x.globalAlpha=(.055*(5-g))*vis;x.translate(cx-velocity*g*.55,cy);x.rotate(rot);x.scale(baseScale,baseScale);x.fillStyle=cfg.color;round(-bw/2,-bh/2,bw,bh,bh/2);x.fill();x.restore()}
 x.save();x.translate(cx,cy);x.rotate(rot);x.scale(baseScale,baseScale);x.translate(-cx,-cy);
 x.shadowColor='rgba(0,0,0,.42)';x.shadowBlur=35;x.shadowOffsetY=16;x.fillStyle=click>.55?(cfg.color==='#ffffff'?'#e5e5e5':'#4752c4'):cfg.color;round(cx-bw/2,cy-bh/2,bw,bh,bh/2);x.fill();x.shadowColor='transparent';
 // Moving highlight across the complete button.
 x.save();round(cx-bw/2,cy-bh/2,bw,bh,bh/2);x.clip();const sx=cx-bw/2+((t*.55)%1)*(bw+180)-90,g=x.createLinearGradient(sx-70,0,sx+70,0);g.addColorStop(0,'transparent');g.addColorStop(.5,'rgba(255,255,255,.28)');g.addColorStop(1,'transparent');x.fillStyle=g;x.fillRect(cx-bw/2,cy-bh/2,bw,bh);x.restore();
 const iconX=cx+bw/2-72,react=clamp((t-2.38)/.55);
 x.save();x.translate(iconX,cy);x.rotate(cfg.icon==='🔔'?Math.sin(react*26)*(1-react)*.28:0);x.scale(1+Math.sin(react*Math.PI)*.28,1+Math.sin(react*Math.PI)*.28);x.translate(-iconX,-cy);
 if(cfg.icon==='discord')discord(iconX,cy,72);else if(cfg.icon){x.font='52px "Segoe UI Emoji"';x.textAlign='center';x.textBaseline='middle';x.fillText(cfg.icon,iconX,cy+2)}x.restore();
 x.direction='rtl';x.textAlign='center';x.textBaseline='alphabetic';x.fillStyle=cfg.text;x.font='800 40px Arial';x.fillText(click>.55?cfg.done:cfg.label,cx-(hasIcon?34:0),cy+14);
 if(click>.05&&t<3.45){const p=clamp((t-2.38)/.9);for(let i=0;i<32;i++){const a=i*2.399,d=ease(p)*(72+(i%7)*18),px=cx+Math.cos(a)*d,py=cy+Math.sin(a)*d; x.save();x.globalAlpha=1-p;x.translate(px,py);x.rotate(a+p*5);x.fillStyle=i%3===0?'#ff0033':i%3===1?'#ffffff':(cfg.color==='#ffffff'?'#111111':'#aeb4ff');if(i%2){x.fillRect(-3,-10,6,20)}else{x.beginPath();x.arc(0,0,4+(i%4),0,7);x.fill()}x.restore()}}
 // Click impact flash and two expanding rings.
 if(t>2.35&&t<3.25){const rp=clamp((t-2.35)/.75);x.globalAlpha=(1-rp)*.7;x.strokeStyle=cfg.color==='#ffffff'?'#ffffff':'#aeb4ff';x.lineWidth=8*(1-rp)+2;x.beginPath();x.ellipse(cx,cy,bw/2+rp*95,bh/2+rp*45,0,0,7);x.stroke();x.globalAlpha=(1-rp)*.3;x.beginPath();x.ellipse(cx,cy,bw/2+rp*165,bh/2+rp*80,0,0,7);x.stroke();x.globalAlpha=1}
 x.restore();
 // Cursor glides in, presses, and leaves.
 if(t>.95&&t<3.75){const p=ease(clamp((t-.95)/1.15)),away=ease((t-2.85)/.72),mx=560+(cx-85-560)*p+away*300,my=990+(cy+25-990)*p+away*100;x.save();x.translate(mx,my);x.rotate(-.08+press*.12);x.scale(1-press*.12,1-press*.12);x.shadowColor='rgba(0,0,0,.35)';x.shadowBlur=9;x.fillStyle='#fff';x.strokeStyle='#111';x.lineWidth=7;x.beginPath();x.moveTo(0,0);x.lineTo(5,72);x.lineTo(24,53);x.lineTo(42,88);x.lineTo(62,77);x.lineTo(43,45);x.lineTo(72,42);x.closePath();x.fill();x.stroke();x.restore()}
 // Subtle attention pulse around the isolated control.
 x.globalAlpha=.18*(1-click);x.strokeStyle=cfg.color==='#ffffff'?'#ffffff':'#8b95ff';x.lineWidth=3;round(cx-bw/2-12-Math.sin(t*3)*5,cy-bh/2-12-Math.sin(t*3)*5,bw+24+Math.sin(t*3)*10,bh+24+Math.sin(t*3)*10,bh);x.stroke();x.globalAlpha=1;
 if(ms<D*1000)requestAnimationFrame(frame);
}
async function go(){const stream=c.captureStream(FPS),r=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:14000000}),parts=[];r.ondataavailable=e=>e.data.size&&parts.push(e.data);const done=new Promise(v=>r.onstop=v);r.start(250);requestAnimationFrame(frame);setTimeout(()=>r.stop(),D*1000+100);await done;const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(parts,{type:'video/webm'}));a.download=cfg.file+'.webm';a.click()}go();
</script>`;

for (const item of buttons) {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  const pending = page.waitForEvent('download', { timeout: 12000 });
  await page.goto(`data:text/html,${encodeURIComponent(html)}#${encodeURIComponent(JSON.stringify(item))}`);
  const webm = resolve(output, `${item.file}.webm`);
  await (await pending).saveAs(webm);
  await context.close();
  const src = `/tmp/${item.file}.webm`, dest = `/tmp/${item.file}.mp4`, mp4 = resolve(output, `${item.file}.mp4`);
  spawnSync('docker', ['cp', webm, `titanbot:${src}`]);
  const encoded = spawnSync('docker', ['exec', 'titanbot', 'ffmpeg', '-loglevel', 'error', '-y', '-i', src, '-vf', 'fps=60,format=yuv420p', '-an', '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', '-movflags', '+faststart', dest], { encoding: 'utf8' });
  if (encoded.status) throw new Error(encoded.stderr);
  spawnSync('docker', ['cp', `titanbot:${dest}`, mp4]);
  await rm(webm);
}
await browser.close();
await writeFile(resolve(output, 'README.txt'), `Isolated Hebrew CTA buttons

Each MP4 contains only one animated pill button:
01 Subscribe • 02 Like • 03 Notifications • 04 Discord

1920×1080, 60 FPS, 6 seconds, green screen (#00FF00).

Professional motion pass: overshoot, directional motion blur, masked shine,
spring cursor, click compression, icon reaction, impact rings, particles, and exit.
`, 'utf8');
console.log(output);
