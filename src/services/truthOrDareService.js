import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed } from '../utils/embeds.js';

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
  'Apa hal paling ngenes yang pernah kamu alamin pas kencan pertama?',
  'Siapa orang yang paling sering kamu stalk di sosial media?',
  'Apa hal yang kamu lakukan pas lagi sendirian yang bikin kamu malu kalau orang tau?',
  'Pernah nge-screenshot chat orang terus dikirim ke temen lain?',
  'Apa hal yang paling kamu benci dari diri kamu sendiri?',
  'Apa hal yang paling kamu suka dari diri kamu sendiri?',
  'Pernah ngelupain ultah orang penting? Siapa?',
  'Apa hal paling kece yang pernah kamu lakukan tapi gak ada orang yang tau?',
  'Siapa orang yang terakhir kali bikin kamu nangis?',
  'Apa hal yang kamu takutin tapi orang lain anggap sepele?',
  'Pernah ngejatuhin barang di tempat umum? Apa & di mana?',
  'Apa hal paling overrated menurut kamu?',
  'Apa hal paling underrated menurut kamu?',
  'Pernah bikin orang lain nangis karena perkataan kamu?',
  'Apa hal yang kamu pengen banget coba tapi belum berani?',
  'Apa hal yang kamu ngerasa paling bangga dari tahun ini?',
  'Pernah salah kirim pesan ke orang yang salah? Isi apa?',
  'Apa hal pertama yang kamu lakuin pas dapet HP baru?',
  'Apa aplikasi di HP kamu yang paling sering kamu buka?',
  'Pernah nge-delete aplikasi terus pasang lagi? Aplikasi apa?',
  'Apa hal yang bikin kamu langsung betah di sebuah grup?',
  'Apa hal yang bikin kamu langsung keluar dari sebuah grup?',
  'Pernah pura-pura ga liat orang yang kamu kenal di jalan?',
  'Apa hal paling bikin kamu takut dari dunia kerja/sekolah?',
  'Siapa member server ini yang menurut kamu paling lucu?',
  'Siapa member server ini yang menurut kamu paling bijak?',
  'Apa hal yang kamu harap bisa kamu ulang dari masa lalu?',
  'Apa hal yang kamu harap bisa kamu hapus dari ingatan kamu?',
  'Pernah bikin hal bodoh karena lagi bosen? Apa itu?',
  'Apa hal paling aneh yang pernah kamu percayain waktu kecil?',
  'Pernah ngakuin kesalahan padahal bukan salah kamu?',
  'Apa hal yang kamu benci dari sosial media sekarang?',
  'Apa hal yang kamu suka dari sosial media sekarang?',
  'Pernah nge-block orang terus unblock lagi? Siapa?',
  'Apa hal paling random yang ada di tas/kantong kamu sekarang?',
  'Apa hal yang kamu lakuin tiap hari tapi orang lain jarang lakuin?',
  'Pernah nge-impersonate orang lain di game atau online?',
  'Apa hal yang kamu banggain dari keluarga kamu?',
  'Apa makanan yang paling kamu benci tapi orang lain suka?',
  'Apa lagu yang paling kamu benci tapi suka nyanyiin?',
  'Pernah nangis karena film atau series? Yang mana?',
  'Apa hal paling bikin kamu kesel dari orang yang tinggal sama kamu?',
  'Apa hal paling bikin kamu happy dari orang yang tinggal sama kamu?',
  'Pernah nge-prank guru/dosen? Apa yang kamu lakuin?',
  'Apa hal paling bikin kamu malas bangun pagi?',
  'Apa hal paling bikin kamu semangat bangun pagi?',
  'Pernah nge-beli barang yang ternyata gak kepake sampe sekarang?',
  'Apa barang yang paling mahal yang pernah kamu beli?',
  'Apa barang yang paling murah tapi paling berguna buat kamu?',
  'Pernah ikut acara yang ternyata membosankan banget?',
  'Apa hal paling embarrassing yang ada di galeri HP kamu?',
  'Pernah nge-delete pesan penting secara ga sengaja?',
  'Apa hal yang kamu lakukan pas lagi stres banget?',
  'Apa hal yang bikin kamu langsung lupa sama masalah kamu?',
  'Pernah nge-follow orang yang gak kamu kenal cuma karena fotonya bagus?',
  'Apa hal yang kamu benci pas lagi main game?',
  'Apa hal yang paling kamu suka pas lagi main game?',
  'Pernah nge-nyerah di tengah game karena terlalu susah?',
  'Apa game yang paling bikin kamu emosi tapi tetep dimainin?',
  'Apa game yang paling berkesan buat kamu sejauh ini?',
  'Apa hal paling spontan yang pernah kamu lakukan tanpa mikir dulu?',
  'Siapa orang yang paling pengen kamu minta maaf tapi belum kesampaian?',
  'Apa yang kamu lakuin kalau lagi kesepian banget?',
  'Pernah nge-fake ketawa biar gak ngecewain orang? Kapan?',
  'Apa hal yang paling kamu takut kalau orang lain sampai tau tentang kamu?',
  'Apa kebohongan kecil yang paling sering kamu bilang?',
  'Siapa orang yang paling sering bikin kamu overthinking?',
  'Apa hal yang pengen kamu bilang tapi selalu kamu tahan?',
  'Pernah ngerasa jadi orang ketiga dalam suatu masalah? Cerita!',
  'Apa hal yang paling kamu syukuri dari keluarga kamu?',
  'Apa yang paling sering bikin kamu nangis sendirian?',
  'Pernah bikin janji yang gak pernah kamu tepatin? Ke siapa?',
  'Apa yang kamu lakuin kalau lagi BT tanpa alasan jelas?',
  'Apa hal paling aneh yang masih kamu simpan sampai sekarang?',
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
  'Kirim pesan ke temen: "kenapa kamu gak pernah chat aku lagi?" terus bilang ini dare.',
  'Ganti nickname server kamu jadi nama makanan favorit kamu selama 30 menit.',
  'Kirim voice note kamu lagi ngomong pake bahasa daerah selama 15 detik.',
  'Posting foto kamu pas kecil (kalau ada) ke channel.',
  'Balas 5 pesan berikutnya dengan jawaban singkat maksimal 3 kata.',
  'Kirim pesan "hai kak, boleh kenalan?" ke 3 orang random di kontak kamu.',
  'Ganti wallpaper HP kamu jadi foto temen kamu selama 1 hari.',
  'Ceritain 1 fakta unik tentang diri kamu yang jarang orang tau.',
  'Kirim sticker/meme paling lucu yang kamu punya ke channel.',
  'Pura-pura jadi orang tua selama 3 menit, jawab semua pesan dengan bijak.',
  'Kirim pesan ke temen: "aku beliin kamu hadiah" terus bilang ini dare.',
  'Ganti bio sosmed kamu jadi lirik lagu paling cheesy yang kamu tau.',
  'Nyanyi 2 baris lagu nasional dengan penuh semangat (kalau di vc).',
  'Kirim foto pemandangan dari jendela kamar kamu sekarang.',
  'Tebak umur tiap member yang lagi online di channel ini (jangan salah!).',
  'Balas semua pesan dengan pake bahasa Inggris selama 5 menit.',
  'Kirim pesan ke temen: "tebak aku lagi ngapain" terus bilang ini dare.',
  'Ganti foto profil kamu jadi karakter kartun favorit kamu selama 15 menit.',
  'Buat kalimat acak dari 5 kata pertama yang kamu lihat di layar kamu.',
  'Kirim voice note kamu lagi nge-rap seadanya selama 20 detik.',
  'Posting foto kamu paling random yang ada di galeri.',
  'Panggil orang tua kamu dan tanya "udah makan belum?" (kalau bisa).',
  'Ganti status WhatsApp/kamu jadi "lagi mikirin kamu" selama 10 menit.',
  'Kirim meme yang paling relate sama hidup kamu sekarang.',
  'Tulis cerita pendek 3 baris tentang member yang kamu tag sebagai lawan main.',
  'Kirim pesan ke temen: "aku ada rahasia penting" terus bilang ini dare.',
  'Impersonate suara hewan selama 30 detik (kalau di vc).',
  'Ganti nickname server kamu jadi gabungan nama kamu + nama hewan.',
  'Kirim foto barang paling aneh yang ada di meja kamu sekarang.',
  'Balas semua pesan dengan pake emoticon kucing selama 3 menit.',
  'Kirim voice note kamu lagi ngomong kayak robot selama 15 detik.',
  'Posting quote dari lagu favorit kamu sebagai status sekarang.',
  'Kirim pesan ke temen: "kamu tau ga, aku admires kamu banget" terus bilang ini dare.',
  'Ganti foto profil kamu jadi emoji favorit kamu selama 10 menit.',
  'Ceritain lelucon tentang programmer (atau apapun) sampai ada yang ketawa.',
  'Kirim foto kamu lagi pose paling random sekarang.',
  'Balas 3 pesan berikutnya dengan pake bahasa gaul jaman old.',
  'Kirim voice note kamu lagi ketawa selama 10 detik tanpa alasan jelas.',
  'Ganti status custom Discord kamu jadi "aku lagi gabut" selama 20 menit.',
  'Kirim pesan ke temen: "ada sayur nyangkut di gigi kamu" terus bilang ini dare.',
  'Ceritain satu kejadian memalukan yang pernah kamu alamin ke channel ini.',
  'Buat caption meme singkat lalu kirim ke channel umum.',
  'Panggil salah satu member dengan sebutan "yang mulia" selama 5 menit.',
  'Kirim voice note kamu ngomong pake logat robot selama 15 detik.',
  'Balas 3 pesan berikutnya dengan huruf kapital semua.',
  'Ganti foto profil kamu jadi meme favorit kamu selama 15 menit.',
  'Kirim pesan ke temen: "kamu lagi di mana? aku nyariin kamu" terus bilang ini dare.',
  'Nyanyi satu baris lagu anak-anak dengan super serius (kalau di vc).',
  'Kirim foto barang berwarna biru yang ada di sekitar kamu sekarang.',
  'Tulis 3 kata pujian buat member pertama yang balas pesan kamu.',
  'Ceritain lelucon paling garing yang kamu tau tanpa ketawa sendiri.',
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
