import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const WIDTH = 1200;
const HEIGHT = 540;
const BACKGROUND_PATH = fileURLToPath(new URL('../assets/voice-milestone-background.jpg', import.meta.url));
const FONT_REGULAR_PATH = fileURLToPath(new URL('../assets/fonts/DejaVuSans.ttf', import.meta.url));
const FONT_BOLD_PATH = fileURLToPath(new URL('../assets/fonts/DejaVuSans-Bold.ttf', import.meta.url));
const FONT_FAMILY = 'Manay Sans';
const FONT_BOLD_FAMILY = 'Manay Sans Bold';
let backgroundPromise;
let fontsRegistered = false;

function ensureFonts() {
  if (fontsRegistered) return;
  GlobalFonts.registerFromPath(FONT_REGULAR_PATH, FONT_FAMILY);
  GlobalFonts.registerFromPath(FONT_BOLD_PATH, FONT_BOLD_FAMILY);
  fontsRegistered = true;
}

function fontString(size, bold = true) {
  return `${size}px "${bold ? FONT_BOLD_FAMILY : FONT_FAMILY}"`;
}

async function loadAvatar(member) {
  const url = member?.user?.displayAvatarURL?.({ extension: 'png', size: 256 });
  if (!url) return null;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await loadImage(Buffer.from(await response.arrayBuffer()));
  } catch {
    return null;
  }
}

function formatDuration(ms) {
  const minutes = Math.floor(Math.max(0, ms) / 60000);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours) return `${hours}j ${remainder}m`;
  if (ms > 0 && remainder === 0) return '<1m';
  return `${remainder}m`;
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function fitCenteredText(context, text, x, y, maxWidth, size, minSize = 16) {
  let fontSize = size;
  context.font = fontString(fontSize);
  while (context.measureText(text).width > maxWidth && fontSize > minSize) {
    fontSize -= 2;
    context.font = fontString(fontSize);
  }
  context.fillText(text, x, y);
}

function drawAvatar(context, avatar, member, x, y, radius, accent) {
  context.beginPath();
  context.arc(x, y, radius + 7, 0, Math.PI * 2);
  context.fillStyle = accent;
  context.fill();

  context.save();
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.clip();
  if (avatar) {
    context.drawImage(avatar, x - radius, y - radius, radius * 2, radius * 2);
  } else {
    context.fillStyle = '#33413D';
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    context.fillStyle = '#FFFFFF';
    context.font = fontString(54);
    context.textAlign = 'center';
    context.fillText((member.displayName || '?').slice(0, 1).toUpperCase(), x, y + 18);
    context.textAlign = 'start';
  }
  context.restore();
}

function drawCrown(context, x, y, color) {
  context.beginPath();
  context.moveTo(x - 40, y + 20);
  context.lineTo(x - 34, y - 12);
  context.lineTo(x - 12, y + 5);
  context.lineTo(x, y - 25);
  context.lineTo(x + 15, y + 5);
  context.lineTo(x + 35, y - 12);
  context.lineTo(x + 41, y + 20);
  context.closePath();
  context.fillStyle = color;
  context.fill();
}

export async function renderVoiceLeaderboardCard({ entries }) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext('2d');
  ensureFonts();
  backgroundPromise ??= readFile(BACKGROUND_PATH).then(loadImage);
  const background = await backgroundPromise;
  const scale = Math.max(WIDTH / background.width, HEIGHT / background.height);
  const bgWidth = background.width * scale;
  const bgHeight = background.height * scale;
  context.drawImage(background, (WIDTH - bgWidth) / 2, (HEIGHT - bgHeight) / 2, bgWidth, bgHeight);
  const overlay = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
  overlay.addColorStop(0, 'rgba(27, 10, 47, 0.94)');
  overlay.addColorStop(0.5, 'rgba(49, 15, 70, 0.88)');
  overlay.addColorStop(1, 'rgba(15, 20, 31, 0.94)');
  context.fillStyle = overlay;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  roundRect(context, 8, 8, WIDTH - 16, HEIGHT - 16, 30);
  context.lineWidth = 4;
  context.strokeStyle = '#A64BE8';
  context.stroke();

  const titleGradient = context.createLinearGradient(52, 0, 490, 0);
  titleGradient.addColorStop(0, '#D58BFF');
  titleGradient.addColorStop(1, '#F5C842');
  context.fillStyle = titleGradient;
  context.font = fontString(54);
  context.letterSpacing = '3px';
  context.fillText('TOP VOICE', 48, 76);
  context.letterSpacing = '0px';
  context.fillStyle = '#F2EAF8';
  context.font = fontString(20);
  context.fillText('LEADERBOARD TOTAL SEPANJANG WAKTU', 52, 110);
  context.textAlign = 'right';
  context.fillStyle = '#E9D5FF';
  context.font = fontString(19);
  context.fillText('UPDATE OTOMATIS · 5 MENIT', WIDTH - 48, 66);
  context.fillStyle = '#C7B4D8';
  context.font = fontString(16, false);
  context.fillText('TIDAK ADA RESET MINGGUAN', WIDTH - 48, 95);
  context.textAlign = 'start';

  const slots = [
    { x: 600, cardX: 410, cardY: 150, width: 380, height: 355, radius: 76, accent: '#F5C842', rank: 1 },
    { x: 230, cardX: 45, cardY: 200, width: 360, height: 305, radius: 62, accent: '#C6D2DE', rank: 2 },
    { x: 970, cardX: 795, cardY: 200, width: 360, height: 305, radius: 62, accent: '#D98B50', rank: 3 },
  ];
  const avatarPromises = entries.slice(0, 3).map((entry) => loadAvatar(entry.member));
  const avatars = await Promise.all(avatarPromises);

  for (let index = 0; index < Math.min(entries.length, 3); index += 1) {
    const entry = entries[index];
    const slot = slots[index];
    const cardY = slot.cardY;
    roundRect(context, slot.cardX, cardY, slot.width, slot.height, 28);
    context.fillStyle = index === 0 ? 'rgba(92, 62, 11, 0.82)' : 'rgba(23, 27, 42, 0.88)';
    context.fill();
    context.lineWidth = 3;
    context.strokeStyle = index === 0 ? '#F5C842' : '#A64BE8';
    context.stroke();

    const avatarY = cardY + (index === 0 ? 112 : 92);
    const avatarRadius = slot.radius;
    if (index === 0) drawCrown(context, slot.x, cardY + 30, '#F5C842');
    drawAvatar(context, avatars[index], entry.member, slot.x, avatarY, avatarRadius, slot.accent);

    const badgeX = slot.x;
    const badgeY = avatarY + avatarRadius - 2;
    context.beginPath();
    context.arc(badgeX, badgeY, 23, 0, Math.PI * 2);
    context.fillStyle = slot.accent;
    context.fill();
    context.textAlign = 'center';
    context.fillStyle = '#101416';
    context.font = fontString(23);
    context.fillText(String(entry.rank), badgeX, badgeY + 8);

    context.fillStyle = '#FFFFFF';
    const name = entry.displayName.length > 26 ? `${entry.displayName.slice(0, 25)}...` : entry.displayName;
    fitCenteredText(context, name, slot.x, cardY + (index === 0 ? 270 : 238), slot.width - 28, 27, 17);

    context.fillStyle = '#D28AFF';
    context.font = fontString(index === 0 ? 35 : 31);
    context.fillText(formatDuration(entry.totalMs), slot.x, cardY + (index === 0 ? 320 : 280));
    context.fillStyle = '#E7DDF0';
    context.font = fontString(17);
    context.fillText('TOTAL VOICE', slot.x, cardY + (index === 0 ? 347 : 302));
    context.textAlign = 'start';
  }

  return canvas.toBuffer('image/png');
}
