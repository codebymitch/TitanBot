import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';

const WIDTH = 1200;
const HEIGHT = 700;
const FONT_REGULAR_PATH = fileURLToPath(new URL('../assets/fonts/DejaVuSans.ttf', import.meta.url));
const FONT_BOLD_PATH = fileURLToPath(new URL('../assets/fonts/DejaVuSans-Bold.ttf', import.meta.url));
const DISPLAY_FONT_PATH = fileURLToPath(new URL('../assets/fonts/BebasNeue-Regular.ttf', import.meta.url));
const FONT = 'Chat Board Sans';
const FONT_BOLD = 'Chat Board Sans Bold';
const FONT_DISPLAY = 'Chat Board Display';
let fontsRegistered = false;

function registerFonts() {
  if (fontsRegistered) return;
  GlobalFonts.registerFromPath(FONT_REGULAR_PATH, FONT);
  GlobalFonts.registerFromPath(FONT_BOLD_PATH, FONT_BOLD);
  GlobalFonts.registerFromPath(DISPLAY_FONT_PATH, FONT_DISPLAY);
  fontsRegistered = true;
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function drawBackground(context) {
  const background = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
  background.addColorStop(0, '#10091F');
  background.addColorStop(0.52, '#321044');
  background.addColorStop(1, '#170B2A');
  context.fillStyle = background;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  const glow = context.createRadialGradient(WIDTH / 2, 350, 60, WIDTH / 2, 350, 610);
  glow.addColorStop(0, 'rgba(143, 36, 168, 0.34)');
  glow.addColorStop(1, 'rgba(143, 36, 168, 0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  context.strokeStyle = 'rgba(205, 153, 255, 0.13)';
  context.lineWidth = 2;
  for (const [centerX, centerY] of [[40, 170], [1160, 360]]) {
    for (let radius = 45; radius <= 210; radius += 35) {
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.stroke();
    }
  }

  const bars = 78;
  const gap = WIDTH / bars;
  for (let index = 0; index < bars; index += 1) {
    const wave = Math.abs(Math.sin(index * 0.47) * Math.cos(index * 0.13));
    const height = 18 + wave * 82;
    roundedRect(context, index * gap + 3, HEIGHT - height - 12, gap - 6, height, 6);
    context.fillStyle = `rgba(202, 119, 235, ${0.10 + wave * 0.12})`;
    context.fill();
  }
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

function drawCrown(context, x, y) {
  context.save();
  context.shadowColor = 'rgba(255, 184, 24, 0.55)';
  context.shadowBlur = 18;
  context.beginPath();
  context.moveTo(x - 70, y + 24);
  context.lineTo(x - 58, y - 20);
  context.lineTo(x - 28, y + 5);
  context.lineTo(x, y - 40);
  context.lineTo(x + 27, y + 5);
  context.lineTo(x + 58, y - 20);
  context.lineTo(x + 70, y + 24);
  context.closePath();
  const gold = context.createLinearGradient(x - 70, y - 40, x + 70, y + 25);
  gold.addColorStop(0, '#FFF276');
  gold.addColorStop(0.55, '#FFC928');
  gold.addColorStop(1, '#E97A00');
  context.fillStyle = gold;
  context.fill();
  context.lineWidth = 3;
  context.strokeStyle = '#FFE778';
  context.stroke();
  context.restore();
}

function drawPodiumEntry(context, entry, avatar, slot) {
  const { x, y, radius, rank, accent, nameY, valueY, detailY } = slot;

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
    context.font = `54px "${FONT_BOLD}"`;
    context.textAlign = 'center';
    context.fillText((entry.displayName || '?').slice(0, 1).toUpperCase(), x, y + 18);
  }
  context.restore();

  const badgeY = y + radius - 2;
  context.beginPath();
  context.arc(x, badgeY, rank === 1 ? 30 : 27, 0, Math.PI * 2);
  context.fillStyle = accent;
  context.fill();
  context.textAlign = 'center';
  context.fillStyle = '#21172B';
  context.font = `36px "${FONT_DISPLAY}"`;
  context.fillText(String(rank), x, badgeY + 12);

  const name = String(entry.displayName || 'Unknown').toUpperCase();
  let nameSize = rank === 1 ? 39 : 34;
  context.font = `bold ${nameSize}px "${FONT_BOLD}"`;
  while (context.measureText(name).width > (rank === 1 ? 470 : 350) && nameSize > 20) {
    nameSize -= 2;
    context.font = `bold ${nameSize}px "${FONT_BOLD}"`;
  }
  context.fillStyle = '#FFFFFF';
  context.fillText(name, x, nameY);

  context.fillStyle = '#D487FF';
  context.font = `53px "${FONT_DISPLAY}"`;
  context.fillText(Number(entry.totalMessages || 0).toLocaleString('id-ID'), x, valueY);
  context.fillStyle = '#E9DDF1';
  context.font = `20px "${FONT_BOLD}"`;
  context.fillText('PESAN', x, detailY);
  context.textAlign = 'start';
}

export async function renderChatLeaderboardCard({ entries }) {
  registerFonts();
  const canvas = createCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext('2d');
  drawBackground(context);

  roundedRect(context, 8, 8, WIDTH - 16, HEIGHT - 16, 34);
  context.lineWidth = 4;
  context.strokeStyle = '#A753D2';
  context.stroke();

  const title = context.createLinearGradient(52, 0, 490, 0);
  title.addColorStop(0, '#C77DFF');
  title.addColorStop(1, '#E64BB5');
  context.fillStyle = title;
  context.font = `91px "${FONT_DISPLAY}"`;
  context.letterSpacing = '2px';
  context.fillText('TOP CHAT', 48, 102);
  context.letterSpacing = '0px';
  context.fillStyle = '#F2EAF8';
  context.font = `23px "${FONT_BOLD}"`;
  context.fillText('LEADERBOARD SEPANJANG WAKTU', 52, 139);
  context.textAlign = 'right';
  context.fillStyle = '#E9D5FF';
  context.font = `42px "${FONT_DISPLAY}"`;
  context.fillText('ALL-TIME CHAT', WIDTH - 48, 72);
  context.fillStyle = '#C7B4D8';
  context.font = `19px "${FONT}"`;
  context.fillText('UPDATE OTOMATIS TIAP 5 MENIT', WIDTH - 48, 106);
  context.textAlign = 'start';

  const podium = [
    { rank: 2, x: 210, y: 320, radius: 78, accent: '#E5E8F2', nameY: 464, valueY: 522, detailY: 566 },
    { rank: 1, x: 600, y: 300, radius: 96, accent: '#FFC928', nameY: 462, valueY: 528, detailY: 576 },
    { rank: 3, x: 990, y: 320, radius: 78, accent: '#F1A113', nameY: 464, valueY: 522, detailY: 566 },
  ];
  const avatars = await Promise.all(entries.slice(0, 3).map(loadAvatar));
  if (entries[0]) drawCrown(context, 600, 137);

  for (let index = 0; index < Math.min(entries.length, 3); index += 1) {
    const slot = podium.find((entry) => entry.rank === index + 1);
    drawPodiumEntry(context, entries[index], avatars[index], slot);
  }

  return canvas.toBuffer('image/png');
}
