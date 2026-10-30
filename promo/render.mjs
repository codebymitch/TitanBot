// Renders the promo pages to MP4 (1080×1920, 30 fps, H.264 + AAC), frame by frame.
//
//   node render.mjs                     all videos
//   node render.mjs v2-bourse           one video
//   node render.mjs --invite discord.gg/xxxx   put the invite link on the last scene
//   node render.mjs --preview           quick 12 fps check, no music
//
// Needs Playwright (Chromium), and ffmpeg (on PATH, or FFMPEG=/path/to/ffmpeg, or
// `pip install imageio-ffmpeg`). The music is made by music.py (numpy + scipy).
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const invite = flag('--invite');
const preview = args.includes('--preview');
const names = args.filter(a => !a.startsWith('--'));
const FPS = preview ? 12 : 30;

function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return 'ffmpeg'; } catch {}
  return execFileSync('python3', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim();
}

const pages = (names.length ? names : readdirSync(here).filter(f => /^v\d.*\.html$/.test(f)).map(f => f.replace('.html', ''))).sort();
const out = join(here, 'out');
mkdirSync(out, { recursive: true });
const ffmpeg = ffmpegPath();
const browser = await chromium.launch();

for (const name of pages) {
  const html = join(here, name + '.html');
  const wav = join(out, name + '.wav');
  const mp4 = join(out, name + (preview ? '.preview' : '') + '.mp4');
  if (!preview) execFileSync('python3', [join(here, 'music.py'), html, wav], { stdio: 'inherit' });

  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const url = pathToFileURL(html).href + '?render=1' + (invite ? '&invite=' + encodeURIComponent(invite) : '');
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.CHAOS.ready);
  const { duration, cover } = await page.evaluate(() => ({ duration: +document.body.dataset.duration, cover: +document.body.dataset.cover || 0 }));

  const ff = spawn(ffmpeg, [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    ...(preview ? [] : ['-i', wav]),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', preview ? 'veryfast' : 'slow', '-crf', preview ? '28' : '18',
    ...(preview ? [] : ['-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '44100', '-c:a', 'aac', '-b:a', '192k', '-shortest']),
    '-movflags', '+faststart', mp4,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => (c ? rej(new Error('ffmpeg exited ' + c)) : res())));

  const frames = Math.round(duration * FPS);
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    await page.evaluate(t => window.CHAOS.renderAt(t), i / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 94 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % (FPS * 2) === 0) process.stdout.write(`\r${name}: ${i}/${frames} frames`);
  }
  ff.stdin.end();
  await done;
  console.log(`\r${name}: ${frames} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${mp4}`);

  // Cover image (thumbnail) at data-cover.
  await page.evaluate(t => window.CHAOS.renderAt(t), cover);
  await page.screenshot({ path: join(out, name + '-cover.png') });
  await page.close();
}
await browser.close();
