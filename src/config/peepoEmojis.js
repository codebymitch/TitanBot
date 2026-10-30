// Peepo emoji pack for the home server. Each one is uploaded from Discord's CDN by its original id.
// [name, id, animated]
export const PEEPO_EMOJIS = [
  ['Peepo_ThumbsUp', '832180017559371806', false],
  ['Peepo_Train', '1003839584288899083', true],
  ['Peepo_Triggered', '847819268929617940', false],
  ['Peepo_TrollFace', '832537739483676693', false],
  ['Peepo_Twerk', '1003843563232182446', true],
  ['Peepo_Typing', '835088092062941194', true],
  ['Peepo_TypingHappy', '835090530555789333', true],
  ['Peepo_UwU', '854962335461539881', false],
  ['Peepo_WallPeek', '1003843526246793327', true],
  ['Peepo_WallTalk', '839865180020277270', true],
  ['Peepo_Wave', '832187545328287774', true],
  ['Peepo_Weeb', '831849604630446100', false],
  ['Peepo_WeebPillow', '831852467008307221', false],
  ['Peepo_Wheelchair', '865254663389577246', false],
  ['Peepo_Wheeze', '851467607051730984', true],
  ['Peepo_Wink', '850363835813724177', true],
  ['Peepo_Witch', '847794027700289537', false],
  ['Peepo_Wizard', '847791597264437308', false],
  ['Peepo_Yikes', '836515659663540254', false],
  ['Peepo_Yoda', '833973387318788096', false],
].map(([name, id, animated]) => ({
  name,
  url: `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}?size=128`,
}));
