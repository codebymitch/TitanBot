// Server owners: they get owner-only access (purge, trust, protected boards, anti-raid trust).
// 1308224908576428079 (izatona) was removed as an owner by the owner's request (report #149).
export const SERVER_OWNER_IDS = ['1159601661392715906'];

export function isServerOwner(userId) {
  return SERVER_OWNER_IDS.includes(String(userId));
}
