// Shared with group creation (src/app/home/actions.ts) and invite-code
// regeneration (src/app/groups/[groupId]/settings/actions.ts) so both
// produce codes from the same alphabet/length.
//
// Excludes visually-confusable characters (0/O, 1/I/L) so a code read aloud
// or typed by hand doesn't misfire.
export function generateInviteCode(length = 6): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
