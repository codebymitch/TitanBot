import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const WIDTH = 1200;
const HEIGHT = 470;
const BACKGROUND_PATH = fileURLToPath(new URL('../assets/voice-milestone-background.jpg', import.meta.url));
let backgroundPromise;

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
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const remainder = minutes % 60;
  if (days) return `${days}h ${hours}j ${remainder}m`;
  if (hours) return `${hours}j ${remainder}m`;
  return `${remainder}m`;
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
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
    context.font = 'bold 54px sans-serif';
    context.textAlign = 'center';
    context.fillText((member.displayName || '?').slice(0, 1).toUpperCase(), x, y + 18);
    context.textAlign = 'start';
  }
  context.restore();
}

export async function renderVoiceLeaderboardCard({ entries }) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext('2d');
  backgroundPromise ??= readFile(BACKGROUND_PATH).then(loadImage);
  const background = await backgroundPromise;
  const scale = Math.max(WIDTH / background.width, HEIGHT / background.height);
  const bgWidth = background.width * scale;
  const bgHeight = background.height * scale;
  context.drawImage(background, (WIDTH - bgWidth) / 2, (HEIGHT - bgHeight) / 2, bgWidth, bgHeight);
  context.fillStyle = 'rgba(7, 12, 16, 0.78)';
  context.fillRect(0, 0, WIDTH, HEIGHT);

  context.fillStyle = '#F5C842';
  context.font = 'bold 34px sans-serif';
  context.letterSpacing = '5px';
  context.fillText('TOP VOICE', 52, 66);
  context.letterSpacing = '0px';
  context.fillStyle = '#D6DEDF';
  context.font = '16px sans-serif';
  context.fillText(`${entries.length} ANGGOTA TERATAS · TOTAL WAKTU VOICE`, 54, 96);

  const slots = [
    { x: 600, cardX: 410, cardY: 125, width: 380, height: 310, radius: 74, accent: '#F5C842', rank: 1 },
    { x: 230, cardX: 55, cardY: 178, width: 350, height: 257, radius: 62, accent: '#C6D2DE', rank: 2 },
    { x: 970, cardX: 795, cardY: 178, width: 350, height: 257, radius: 62, accent: '#D98B50', rank: 3 },
  ];
  const avatarPromises = entries.slice(0, 3).map((entry) => loadAvatar(entry.member));
  const avatars = await Promise.all(avatarPromises);

  for (let index = 0; index < Math.min(entries.length, 3); index += 1) {
    const entry = entries[index];
    const slot = slots[index];
    const cardY = slot.cardY;
    roundRect(context, slot.cardX, cardY, slot.width, slot.height, 28);
    context.fillStyle = index === 0 ? 'rgba(116, 87, 8, 0.78)' : 'rgba(29, 37, 44, 0.88)';
    context.fill();
    context.lineWidth = 3;
    context.strokeStyle = slot.accent;
    context.stroke();

    drawAvatar(context, avatars[index], entry.member, slot.x, cardY + 82, slot.radius, slot.accent);

    const badgeX = slot.x + slot.radius * 0.72;
    const badgeY = cardY + 82 - slot.radius * 0.72;
    context.beginPath();
    context.arc(badgeX, badgeY, 27, 0, Math.PI * 2);
    context.fillStyle = slot.accent;
    context.fill();
    context.fillStyle = slot.accent;
    context.font = 'bold 23px sans-serif';
    context.textAlign = 'center';
    context.fillStyle = '#101416';
    context.font = 'bold 20px sans-serif';
    context.fillText(`#${entry.rank}`, badgeX, badgeY + 7);

    context.fillStyle = '#FFFFFF';
    context.font = 'bold 24px sans-serif';
    const name = entry.displayName.length > 22 ? `${entry.displayName.slice(0, 21)}...` : entry.displayName;
    context.fillText(name, slot.x, cardY + (index === 0 ? 230 : 182));

    context.fillStyle = slot.accent;
    context.font = `bold ${index === 0 ? 34 : 29}px sans-serif`;
    context.fillText(`TOTAL VOICE  ${formatDuration(entry.totalMs)}`, slot.x, cardY + (index === 0 ? 280 : 222));
    context.textAlign = 'start';
  }

  return canvas.toBuffer('image/png');
}
