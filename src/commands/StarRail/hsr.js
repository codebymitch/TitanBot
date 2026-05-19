import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const PATHS = [
  { name: 'The Hunt',    aeon: 'Lan',    color: 0x4B9CD3, emoji: '🏹', desc: 'You pursue a singular goal with relentless focus. Nothing will stand between you and your quarry.' },
  { name: 'Erudition',   aeon: 'Nous',   color: 0xA78BFA, emoji: '📚', desc: 'You seek knowledge above all else. The universe is a puzzle, and you will solve it.' },
  { name: 'Nihility',    aeon: 'IX',     color: 0x6B7280, emoji: '🌑', desc: 'You see through the illusions of meaning. In emptiness, you find a strange kind of freedom.' },
  { name: 'Abundance',   aeon: 'Yaoshi', color: 0x34D399, emoji: '🌿', desc: 'Life flows through you. You nurture, heal, and let existence flourish.' },
  { name: 'Preservation',aeon: 'Qlipoth',color: 0xF59E0B, emoji: '🛡️', desc: 'You stand as an unbreakable wall between the innocent and the void.' },
  { name: 'Harmony',     aeon: 'Xipe',   color: 0xF472B6, emoji: '🎵', desc: 'You weave connections between all things. In unity, you find your strength.' },
  { name: 'Destruction', aeon: 'Nanook', color: 0xEF4444, emoji: '💥', desc: 'Creation and destruction are one. You burn away the old to make room for what must come.' },
  { name: 'Remembrance', aeon: 'Fuli',   color: 0x60A5FA, emoji: '❄️', desc: 'Memory is the thread that binds existence. You preserve what time would otherwise erase.' },
  { name: 'Elation',     aeon: 'Aha',    color: 0xFBBF24, emoji: '🃏', desc: "The universe is a grand joke — and you're in on it. Joy and chaos walk hand in hand." },
];

const QUOTES = [
  { char: 'Kafka',       color: 0x7C3AED, quote: 'There are things in this world that logic alone cannot explain.' },
  { char: 'Firefly',     color: 0xFF6B35, quote: 'Even a single fleeting moment of warmth is worth protecting.' },
  { char: 'Robin',       color: 0xF9A8D4, quote: 'Music is the language the universe speaks when words fall short.' },
  { char: 'Black Swan',  color: 0x312E81, quote: 'Every secret has a price. The question is whether you can afford to know.' },
  { char: 'Sunday',      color: 0xFDE68A, quote: 'Paradise is not a place — it is a promise. And I intend to keep it.' },
  { char: 'Aventurine',  color: 0x10B981, quote: 'Everything in life is a gamble. The trick is knowing when to fold.' },
  { char: 'Blade',       color: 0xDC2626, quote: 'Death is not an ending. It is simply the next wager.' },
  { char: 'Ruan Mei',    color: 0xFF8FAB, quote: "Life is an experiment without a control group. Every result is valid." },
  { char: 'Silver Wolf', color: 0x06B6D4, quote: 'Reality is just code. And all code has exploits.' },
  { char: 'Welt',        color: 0x3B82F6, quote: 'A universe without stories is just empty space.' },
  { char: 'Jingliu',     color: 0x93C5FD, quote: 'The sword does not weep for what it cuts.' },
  { char: 'Acheron',     color: 0x4B0082, quote: 'At the end of every road lies a sky full of stars — and one final blade.' },
  { char: 'Gallagher',   color: 0xD97706, quote: "A good drink and a clear conscience. That's all a man really needs." },
  { char: 'Sparkle',     color: 0xEC4899, quote: "Every performance needs an audience. Lucky you — you're mine." },
  { char: 'Feixiao',     color: 0x0EA5E9, quote: 'The sky is not a limit. It is merely the beginning of the hunt.' },
  { char: 'Jiaoqiu',     color: 0xFF4500, quote: 'Every flame tells a truth. Whether you want to hear it is another matter.' },
  { char: 'Mydei',       color: 0x8B0000, quote: 'A king who cannot shoulder the weight of sacrifice has no right to the throne.' },
  { char: 'Castorice',   color: 0x9D4EDD, quote: 'The dead do not ask to be remembered. We remember them because we cannot bear not to.' },
];

const CHARACTERS = [
  { name: 'Firefly',     path: 'Destruction', element: 'Fire',      rarity: 5, desc: 'A girl who carries the weight of an eternal war — and still finds warmth in the smallest moments.' },
  { name: 'Robin',       path: 'Harmony',     element: 'Physical',  rarity: 5, desc: "The songbird of Penacony whose voice resonates across the entire universe." },
  { name: 'Acheron',     path: 'Nihility',    element: 'Lightning', rarity: 5, desc: 'A lone blade wandering the edge of the universe, guided by a promise to an empty sky.' },
  { name: 'Kafka',       path: 'Nihility',    element: 'Lightning', rarity: 5, desc: 'A Stellaron Hunter who speaks in riddles and leaves destruction in her wake.' },
  { name: 'Ruan Mei',    path: 'Harmony',     element: 'Ice',       rarity: 5, desc: "A researcher of life's essence who treats the universe itself as her laboratory." },
  { name: 'Sunday',      path: 'Harmony',     element: 'Imaginary', rarity: 5, desc: "The patriarch of Penacony's Family who believes Paradise is a debt — paid by everyone else." },
  { name: 'Black Swan',  path: 'Nihility',    element: 'Wind',      rarity: 5, desc: 'A Memokeeper who reads memories like open books, always smiling at what she finds.' },
  { name: 'Aventurine',  path: 'Preservation',element: 'Imaginary', rarity: 5, desc: 'A gambler who has already bet everything — and somehow keeps winning.' },
  { name: 'Silver Wolf', path: 'Nihility',    element: 'Quantum',   rarity: 5, desc: 'A legendary hacker who sees reality as just another system to be cracked.' },
  { name: 'Blade',       path: 'The Hunt',    element: 'Wind',      rarity: 5, desc: 'A man cursed with immortality who seeks only one thing: a worthy death.' },
  { name: 'Jingliu',     path: 'The Hunt',    element: 'Ice',       rarity: 5, desc: 'A fallen sword master whose beauty is matched only by her devastation.' },
  { name: 'Feixiao',     path: 'The Hunt',    element: 'Wind',      rarity: 5, desc: 'The lord of the Ten-Lords Commission whose spear strikes faster than the eye can follow.' },
  { name: 'Jiaoqiu',     path: 'Nihility',    element: 'Fire',      rarity: 5, desc: 'A fox diviner of the Xianzhou Alliance whose incense carries both blessing and ruin.' },
  { name: 'Mydei',       path: 'Destruction', element: 'Fire',      rarity: 5, desc: 'A king reborn in flame who carries the sins of an entire civilization on his shoulders.' },
  { name: 'Castorice',   path: 'Remembrance', element: 'Quantum',   rarity: 5, desc: 'A guardian at the boundary of life and death who speaks for those who can no longer speak.' },
  { name: 'Herta',       path: 'Erudition',   element: 'Ice',       rarity: 5, desc: 'A genius researcher who built an entire space station just to have somewhere to store her research.' },
  { name: 'Seele',       path: 'The Hunt',    element: 'Quantum',   rarity: 5, desc: 'A survivor of Jarilo-VI whose blade has tasted both despair and hard-won hope.' },
  { name: 'Gallagher',   path: 'Abundance',   element: 'Fire',      rarity: 4, desc: "Penacony's bartender who mixes drinks, bends rules, and somehow always ends up in the middle of things." },
];

const DREAMS = [
  {
    title: '🌙 The Eternal Night of Penacony',
    color: 0x1E1B4B,
    desc: 'The clock stopped long ago, yet the music never ends. In the Land of Dreams, everyone sleeps — and no one truly wakes.\n\n*The Dreamscape wraps around you like silk. You can feel its warmth, its weight, its lie.*',
  },
  {
    title: '🎭 The Masquerade',
    color: 0x4C1D95,
    desc: "Behind every mask in Penacony lies another mask. The Family smiles, the guests dance, and somewhere in the halls — someone is counting the cost.\n\n*Do you see the strings? Or are you holding one?*",
  },
  {
    title: '🕰️ Where Time Stands Still',
    color: 0x1F2937,
    desc: "The Dreamscape does not obey the universe's rules. Here, the dead still laugh at dinner tables. Old songs play from gramophones with no one to wind them.\n\n*Some dreams are worth keeping. Others are cages with gilded bars.*",
  },
  {
    title: '🌌 The Memory You Lost',
    color: 0x312E81,
    desc: 'You reach for something — a face, a name, a moment — and find only mist. The Dreamscape holds what the waking world has forgotten.\n\n*Perhaps that is why people come to Penacony. Not for the music. For the things they are afraid to remember.*',
  },
  {
    title: "🔮 Sunday's Paradise",
    color: 0x7C3AED,
    desc: '"Paradise is a world where no one suffers." He says it like a vow. Like a threat.\n\n*And in Penacony\'s eternal night, you begin to wonder — who decided what paradise looks like? And who was left outside its walls?*',
  },
  {
    title: '🎼 Robin\'s Last Song',
    color: 0xF9A8D4,
    desc: 'Her voice carried across every corner of the Dreamscape — through the ballrooms, through the grief, through the silence after the music stopped.\n\n*Some songs are not meant to end. They are meant to echo.*',
  },
];

const ELEM_EMOJI = { Fire: '🔥', Ice: '❄️', Lightning: '⚡', Wind: '💨', Quantum: '🌀', Imaginary: '✨', Physical: '⚪' };
const PATH_EMOJI = { 'The Hunt': '🏹', Erudition: '📚', Nihility: '🌑', Abundance: '🌿', Preservation: '🛡️', Harmony: '🎵', Destruction: '💥', Remembrance: '❄️', Elation: '🃏' };

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

export default {
  data: new SlashCommandBuilder()
    .setName('hsr')
    .setDescription('Honkai: Star Rail commands')
    .addSubcommand(s => s.setName('path').setDescription('Discover which Path of the Aeons you walk'))
    .addSubcommand(s => s.setName('quote').setDescription('Receive wisdom from a Star Rail character'))
    .addSubcommand(s => s.setName('roll').setDescription('Pull from the warp — fate decides your character'))
    .addSubcommand(s => s.setName('dream').setDescription('Enter the Dreamscape of Penacony')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'path') {
      const path = pick(PATHS);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(path.color)
          .setTitle(`${path.emoji} Path of ${path.name}`)
          .setDescription(`*"${path.desc}"*`)
          .addFields({ name: 'Aeon', value: path.aeon, inline: true })
          .setFooter({ text: `${interaction.user.username} walks the Path of ${path.name}` })],
      });
    }

    if (sub === 'quote') {
      const q = pick(QUOTES);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(q.color)
          .setDescription(`*"${q.quote}"*`)
          .setFooter({ text: `— ${q.char}` })],
      });
    }

    if (sub === 'roll') {
      const char = pick(CHARACTERS);
      const stars = '⭐'.repeat(char.rarity);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xFFD700)
          .setTitle(`✨ You pulled ${char.name}!`)
          .setDescription(char.desc)
          .addFields(
            { name: 'Path',    value: `${PATH_EMOJI[char.path] ?? '⭐'} ${char.path}`,       inline: true },
            { name: 'Element', value: `${ELEM_EMOJI[char.element] ?? '✨'} ${char.element}`, inline: true },
            { name: 'Rarity',  value: stars,                                                  inline: true },
          )
          .setFooter({ text: 'The universe has chosen for you.' })],
      });
    }

    if (sub === 'dream') {
      const dream = pick(DREAMS);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(dream.color)
          .setTitle(dream.title)
          .setDescription(dream.desc)
          .setFooter({ text: 'Penacony — Land of Dreams' })],
      });
    }
  },
};
