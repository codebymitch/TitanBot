import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';

const WIDTH = 1200;
const HEIGHT = 700;
const FONT_REGULAR_PATH = fileURLToPath(new URL('../assets/fonts/DejaVuSans.ttf', import.meta.url));
const FONT_BOLD_PATH = fileURLToPath(new URL('../assets/fonts/DejaVuSans-Bold.ttf', import.meta.url));
const DISPLAY_FONT_PATH = fileURLToPath(new URL('../assets/fonts/BebasNeue-Regular.ttf', import.meta.url));
const FONT_FAMILY = 'Manay Sans';
const FONT_BOLD_FAMILY = 'Manay Sans Bold';
const DISPLAY_FONT_FAMILY = 'Manay Display';
let fontsRegistered = false;

function ensureFonts() {
  if (fontsRegistered) return;
  GlobalFonts.registerFromPath(FONT_REGULAR_PATH, FONT_FAMILY);
  GlobalFonts.registerFromPath(FONT_BOLD_PATH, FONT_BOLD_FAMILY);
  GlobalFonts.registerFromPath(DISPLAY_FONT_PATH, DISPLAY_FONT_FAMILY);
  fontsRegistered = true;
}

function fontString(size, bold = true) {
  return `${size}px "${bold ? FONT_BOLD_FAMILY : FONT_FAMILY}"`;
}

function displayFontString(size) {
  return `${size}px "${DISPLAY_FONT_FAMILY}"`;
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

function formatTotalMinutes(ms) {
  return Math.floor(Math.max(0, Number(ms) || 0) / 60000).toLocaleString('id-ID');
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

function drawCrown(context, x, y) {
  context.save();
  context.translate(x, y);
  context.scale(0.88, 0.88);
  context.translate(-x, -y);
  context.shadowColor = 'rgba(255, 184, 24, 0.6)';
  context.shadowBlur = 18;
  context.shadowOffsetY = 4;

  context.beginPath();
  context.moveTo(x - 70, y + 4);
  context.lineTo(x - 48, y + 27);
  context.lineTo(x - 34, y - 3);
  context.lineTo(x - 12, y + 22);
  context.lineTo(x, y - 20);
  context.lineTo(x + 15, y + 22);
  context.lineTo(x + 38, y - 3);
  context.lineTo(x + 50, y + 27);
  context.lineTo(x + 70, y + 4);
  context.lineTo(x + 58, y + 49);
  context.lineTo(x - 58, y + 49);
  context.closePath();
  const body = context.createLinearGradient(x - 64, y, x + 54, y + 48);
  body.addColorStop(0, '#FFF276');
  body.addColorStop(0.34, '#FFC928');
  body.addColorStop(0.72, '#FF9F0A');
  body.addColorStop(1, '#E97A00');
  context.fillStyle = body;
  context.fill();
  context.lineWidth = 3;
  context.strokeStyle = '#FFE778';
  context.stroke();

  context.shadowColor = 'transparent';
  const facets = [
    [[x - 70, y + 4], [x - 48, y + 27], [x - 58, y + 49]],
    [[x - 48, y + 27], [x - 34, y - 3], [x - 24, y + 49]],
    [[x - 34, y - 3], [x - 12, y + 22], [x - 24, y + 49]],
    [[x - 12, y + 22], [x, y - 20], [x + 5, y + 49]],
    [[x, y - 20], [x + 15, y + 22], [x + 5, y + 49]],
    [[x + 15, y + 22], [x + 38, y - 3], [x + 29, y + 49]],
    [[x + 38, y - 3], [x + 50, y + 27], [x + 29, y + 49]],
    [[x + 50, y + 27], [x + 70, y + 4], [x + 58, y + 49]],
  ];
  facets.forEach((points, index) => {
    context.beginPath();
    context.moveTo(...points[0]);
    context.lineTo(...points[1]);
    context.lineTo(...points[2]);
    context.closePath();
    context.fillStyle = index % 2 === 0
      ? 'rgba(255, 246, 125, 0.48)'
      : 'rgba(222, 112, 0, 0.25)';
    context.fill();
  });

  const band = context.createLinearGradient(x, y + 36, x, y + 59);
  band.addColorStop(0, '#FFE95B');
  band.addColorStop(0.55, '#FFB800');
  band.addColorStop(1, '#D87800');
  context.beginPath();
  context.moveTo(x - 60, y + 38);
  context.quadraticCurveTo(x, y + 48, x + 60, y + 38);
  context.lineTo(x + 55, y + 57);
  context.quadraticCurveTo(x, y + 68, x - 55, y + 57);
  context.closePath();
  context.fillStyle = band;
  context.fill();
  context.lineWidth = 2;
  context.strokeStyle = '#FFE778';
  context.stroke();

  for (const [gemX, gemY, radius] of [
    [x - 70, y + 4, 6],
    [x - 34, y - 3, 6],
    [x, y - 20, 8],
    [x + 38, y - 3, 6],
    [x + 70, y + 4, 6],
  ]) {
    const gem = context.createRadialGradient(gemX - 2, gemY - 3, 1, gemX, gemY, radius);
    gem.addColorStop(0, '#FFFBD0');
    gem.addColorStop(0.45, '#FFD64A');
    gem.addColorStop(1, '#D87500');
    context.beginPath();
    context.arc(gemX, gemY, radius, 0, Math.PI * 2);
    context.fillStyle = gem;
    context.fill();
    context.lineWidth = 1.5;
    context.strokeStyle = '#FFF1A3';
    context.stroke();
  }

  const jewelY = y + 51;
  context.beginPath();
  context.moveTo(x, jewelY - 7);
  context.lineTo(x + 8, jewelY);
  context.lineTo(x, jewelY + 7);
  context.lineTo(x - 8, jewelY);
  context.closePath();
  context.fillStyle = '#F48608';
  context.fill();
  context.restore();
}

function drawBackground(context) {
  const gradient = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, '#10091F');
  gradient.addColorStop(0.52, '#321044');
  gradient.addColorStop(1, '#170B2A');
  context.fillStyle = gradient;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  const glow = context.createRadialGradient(WIDTH / 2, 340, 70, WIDTH / 2, 340, 600);
  glow.addColorStop(0, 'rgba(143, 36, 168, 0.30)');
  glow.addColorStop(1, 'rgba(143, 36, 168, 0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  context.save();
  context.strokeStyle = 'rgba(205, 153, 255, 0.13)';
  context.lineWidth = 2;
  for (const [cx, cy] of [[38, 170], [1160, 360]]) {
    for (let radius = 45; radius <= 210; radius += 35) {
      context.beginPath();
      context.arc(cx, cy, radius, 0, Math.PI * 2);
      context.stroke();
    }
  }

  context.fillStyle = 'rgba(218, 160, 255, 0.06)';
  for (let i = 0; i < 26; i += 1) {
    const x = (i * 173 + 47) % WIDTH;
    const y = (i * 97 + 33) % HEIGHT;
    context.beginPath();
    context.arc(x, y, (i % 3) + 1, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();

  const bars = 78;
  const gap = WIDTH / bars;
  for (let i = 0; i < bars; i += 1) {
    const wave = Math.abs(Math.sin(i * 0.47) * Math.cos(i * 0.13));
    const barHeight = 18 + wave * 82;
    roundRect(context, i * gap + 3, HEIGHT - barHeight - 12, gap - 6, barHeight, 6);
    context.fillStyle = `rgba(202, 119, 235, ${0.10 + wave * 0.12})`;
    context.fill();
  }
}

function drawPodiumEntry(context, entry, avatar, config) {
  const { x, y, radius, rank, accent, nameY, durationY, minutesY } = config;
  drawAvatar(context, avatar, entry.member, x, y, radius, accent);

  const badgeY = y + radius - 2;
  context.beginPath();
  context.arc(x, badgeY, rank === 1 ? 30 : 27, 0, Math.PI * 2);
  context.fillStyle = accent;
  context.fill();
  context.textAlign = 'center';
  context.fillStyle = '#21172B';
  context.font = displayFontString(rank === 1 ? 40 : 36);
  context.fillText(String(rank), x, badgeY + 12);

  const displayName = String(entry.displayName || 'Unknown').toUpperCase();
  context.fillStyle = '#FFFFFF';
  fitCenteredText(context, displayName, x, nameY, rank === 1 ? 470 : 350, rank === 1 ? 39 : 34, 20);
  context.fillStyle = '#D487FF';
  context.font = displayFontString(rank === 1 ? 53 : 47);
  context.fillText(formatDuration(entry.totalMs), x, durationY);
  context.fillStyle = '#E9DDF1';
  context.font = fontString(20);
  context.fillText(`${formatTotalMinutes(entry.totalMs)} MENIT`, x, minutesY);
  context.textAlign = 'start';
}

export async function renderVoiceLeaderboardCard({ entries }) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext('2d');
  ensureFonts();
  drawBackground(context);

  roundRect(context, 8, 8, WIDTH - 16, HEIGHT - 16, 34);
  context.lineWidth = 4;
  context.strokeStyle = '#A753D2';
  context.stroke();

  const titleGradient = context.createLinearGradient(52, 0, 490, 0);
  titleGradient.addColorStop(0, '#C77DFF');
  titleGradient.addColorStop(1, '#E64BB5');
  context.fillStyle = titleGradient;
  context.font = displayFontString(91);
  context.letterSpacing = '2px';
  context.fillText('TOP VOICE', 48, 102);
  context.letterSpacing = '0px';
  context.textAlign = 'right';
  context.fillStyle = '#C7B4D8';
  context.font = fontString(19, false);
  context.fillText('UPDATE OTOMATIS TIAP 5 MENIT', WIDTH - 48, 52);
  context.textAlign = 'start';

  const podium = [
    { rank: 2, x: 210, y: 320, radius: 78, accent: '#E5E8F2', nameY: 464, durationY: 522, minutesY: 566 },
    { rank: 1, x: 600, y: 300, radius: 96, accent: '#FFC928', nameY: 462, durationY: 528, minutesY: 576 },
    { rank: 3, x: 990, y: 320, radius: 78, accent: '#F1A113', nameY: 464, durationY: 522, minutesY: 566 },
  ];
  const avatarPromises = entries.slice(0, 3).map((entry) => loadAvatar(entry.member));
  const avatars = await Promise.all(avatarPromises);
  if (entries[0]) drawCrown(context, 600, 137);

  for (let index = 0; index < Math.min(entries.length, 3); index += 1) {
    const rank = index + 1;
    const config = podium.find((slot) => slot.rank === rank);
    drawPodiumEntry(context, entries[index], avatars[index], config);
  }

  return canvas.toBuffer('image/png');
}
