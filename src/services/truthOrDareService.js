import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

// Kumpulan pertanyaan Truth (pertanyaan jujur) — aman & cocok untuk komunitas umum.
export const TRUTH_PROMPTS = [
  'Apa hal paling memalukan yang pernah kamu lakukan di depan umum?',
  'Siapa orang yang pertama kali kamu sukai?',
  'Apa hal teraneh yang pernah kamu makan?',
  'Pernah ngechat sama mantan? Ceritakan!',
  'Apa ketakutan terbesar kamu yang belum banyak orang tahu?',
  'Apa kebiasaan buruk yang masih kamu lakukan sampai sekarang?',
  'Pernah bohong buat ngehindarin sesuatu yang penting? Apa itu?',
  'Apa hal yang paling kamu sesali dalam hidup sejauh ini?',
  'Siapa orang yang paling ngeselin di server ini menurut kamu?',
  'Apa hal paling cringe yang pernah kamu posting di sosial media?',
  'Pernah kepo sama akun mantan pacar? Seberapa sering?',
  'Apa rahasia yang kamu sembunyiin dari orang tua kamu?',
  'Apa hal paling gila yang pernah kamu lakukan demi orang yang kamu suka?',
  'Pernah pura-pura sakit padahal cuma males? Cerita!',
  'Apa hal paling childish yang masih kamu suka lakukan?',
  'Apa pendapat jujur kamu tentang owner server ini?',
  'Pernah nyolong barang waktu kecil? Apa itu?',
  'Apa hal yang paling kamu banggain tapi jarang kamu ceritain?',
  'Apa hal pertama yang kamu lakuin pas bangun tidur?',
  'Apa mimpi teraneh yang pernah kamu alami?',
  'Siapa orang terakhir yang kamu chat malam-malam?',
  'Apa hal yang kamu benci tapi orang lain suka?',
  'Pernah ketahuan ngelakuin hal memalukan? Sama siapa?',
  'Apa hal paling berani yang pernah kamu lakukan?',
  'Apa yang paling kamu takutkan dari masa depan?',
  'Apa hal paling boros yang pernah kamu beli?',
  'Pernah nge-prank temen sampe dia marah beneran?',
  'Apa hal yang bikin kamu iri sama orang lain?',
  'Apa keahlian tersembunyi yang kamu punya?',
  'Apa hal paling embarrassing yang pernah kamu search di Google?',
  'Apa nama panggilan masa kecil kamu yang paling kamu benci?',
  'Pernah nge-fans sama seseorang di server ini? Siapa?',
  'Apa hal yang paling kamu sesali dari hubungan masa lalu?',
  'Apa makanan favorit kamu yang orang lain anggap aneh?',
  'Pernah nangis karena hal sepele? Apa itu?',
  'Apa yang kamu lakuin pas sendiri di rumah tanpa ada orang?',
  'Siapa orang yang paling kamu kagumi di dunia nyata?',
  'Apa hal yang paling kamu harapkan dari tahun ini?',
  'Pernah pura-pura ngerti padahal gak ngerti? Kapan?',
  'Apa hal paling random yang pernah kamu lakukan tengah malam?',
];

// Kumpulan tantangan Dare — aman, lucu, dan tidak berbahaya.
export const DARE_PROMPTS = [
  'Kirim pesan "Aku kangen kamu" ke orang terakhir yang kamu chat.',
  'Ganti foto profil Discord kamu jadi foto kucing selama 10 menit.',
  'Nyanyi satu baris lagu favorit kamu di voice channel (kalau lagi di vc).',
  'Kirim sticker/meme paling cringe yang kamu punya ke channel umum.',
  'Panggil salah satu member dengan nama hewan selama 5 menit.',
  'Posting status "hari ini aku merasa cantik/ganteng banget" di sosmed kamu.',
  'Kirim DM ke temen kamu dan bilang "kamu tau ga, kamu orang paling spesial" tanpa konteks.',
  'Ganti status custom Discord kamu jadi "lagi bosen, temenin dong" selama 15 menit.',
  'Ceritain lelucon terburuk yang kamu tau di channel.',
  'Tulis pesan 3 baris tentang betapa hebatnya owner server ini.',
  'Balas pesan orang berikutnya dengan pake emoji saja selama 3 pesan.',
  'Kirim foto meja kerja/kamar kamu ke channel (boleh blur bagian privat).',
  'Pura-pura jadi bot selama 2 menit, jawab semua pesan pake "beep boop".',
  'Buat playlist lagu sedih dan share ke channel.',
  'Kirim selfie paling jelek yang kamu punya ke channel umum.',
  'Panggil temen kamu lewat telepon dan nyanyi lagu ulang tahun.',
  'Tulis puisi 4 baris tentang makanan favorit kamu.',
  'Ganti nickname server kamu jadi sesuatu yang lucu selama 1 jam.',
  'Kirim "aku cinta kamu" ke contact pertama di HP kamu.',
  'Ceritain mimpi terburuk kamu seolah-olah itu kejadian nyata.',
  'Imitasi suara salah satu temen kamu selama 30 detik.',
  'Kirim meme yang paling kamu suka ke 3 orang sekaligus.',
  'Nama hewan + warna baju kamu sekarang = nama superhero kamu. Posting!',
  'Balas semua pesan dengan jawaban "iya" selama 5 menit.',
  'Kirim pesan ke temen: "aku butuh 500k, pinjem dong" terus bilang ini dare.',
  'Ganti foto profil kamu jadi foto temen kamu selama 10 menit.',
  'Ceritain lelucon sampai minimal satu orang ketawa.',
  'Kirim voice note kamu lagi ngebeatbox (meskipun jelek).',
  'Posting quote paling memotivasi yang kamu tau sekarang.',
  'Ajak satu orang di server ini main bareng game dalam 10 menit.',
  'Kirim pesan ke temen: "serius ya, ada yang mau aku omongin" lalu bilang ini dare.',
  'Ganti status Discord kamu jadi "jangan ganggu, lagi sedih" selama 10 menit.',
  'Tulis lirik lagu favorit kamu satu baris per pesan di channel.',
  'Kirim foto makanan terakhir yang kamu makan.',
  'Impersonate salah satu member server selama 2 menit.',
];

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * Pilih prompt Truth atau Dare.
 * @param {'truth'|'dare'|'random'} type
 * @returns {{ category: 'truth'|'dare', prompt: string }}
 */
export function pickTruthOrDare(type = 'random') {
  if (type === 'truth') {
    return { category: 'truth', prompt: pickRandom(TRUTH_PROMPTS) };
  }
  if (type === 'dare') {
    return { category: 'dare', prompt: pickRandom(DARE_PROMPTS) };
  }
  const isTruth = Math.random() < 0.5;
  return isTruth
    ? { category: 'truth', prompt: pickRandom(TRUTH_PROMPTS) }
    : { category: 'dare', prompt: pickRandom(DARE_PROMPTS) };
}

const CATEGORY_META = {
  truth: {
    label: 'TRUTH',
    emoji: '💬',
    color: '#3B82F6',
  },
  dare: {
    label: 'DARE',
    emoji: '🔥',
    color: '#EF4444',
  },
};

/**
 * Bangun embed untuk Truth or Dare.
 * @param {{ category: 'truth'|'dare', prompt: string, requestedBy?: import('discord.js').User }} param0
 */
export function buildTruthOrDareEmbed({ category, prompt, requestedBy }) {
  const meta = CATEGORY_META[category] || CATEGORY_META.truth;

  const embed = createEmbed({
    title: `${meta.emoji} ${meta.label}`,
    description: `**${prompt}**`,
    color: meta.color,
  });

  if (requestedBy) {
    embed.setFooter({
      text: `Diminta oleh ${requestedBy.username}`,
      iconURL: requestedBy.displayAvatarURL?.(),
    });
  }

  return embed;
}

/**
 * Bangun tombol aksi Truth / Dare / Random untuk re-roll.
 * @returns {import('discord.js').ActionRowBuilder[]}
 */
export function buildTruthOrDareComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('tod:truth')
        .setLabel('💬 Truth')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('tod:dare')
        .setLabel('🔥 Dare')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('tod:random')
        .setLabel('🎲 Random')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}
