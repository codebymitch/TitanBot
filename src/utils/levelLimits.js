export const MAX_LEVEL = 50;
export const MAX_COMMUNITY_XP = MAX_LEVEL * MAX_LEVEL * 100;

export function communityLevelFromXp(xp) {
  return Math.min(MAX_LEVEL, Math.floor(Math.sqrt(Math.max(0, Number(xp) || 0) / 100)));
}

export function clampCommunityXp(xp) {
  return Math.min(MAX_COMMUNITY_XP, Math.max(0, Number(xp) || 0));
}
