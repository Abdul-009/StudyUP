// Shared input handling for user-authored free text - chat messages (group
// and DM, including edits), group name/description, assignment title/
// description, announcement content, and poll question/options.
//
// Both checks below are enforced server-side, in every action that writes
// one of these fields, since that's the real trust boundary: a client-side
// check is UX only and can be bypassed by anyone calling the action directly.
//
//   1. Strip characters that have no business in human-authored text: the
//      NUL byte (Postgres' text columns reject it outright, turning what
//      should be a clean validation error into a raw 500) and other C0/C1
//      control characters, while preserving newline/CR/tab since people
//      genuinely use those in multi-line messages.
//   2. Cap length, so nothing pathological (megabytes of text in one field)
//      reaches the database or gets broadcast to every other client.

// Charcode-range check rather than a regex literal with unicode escapes, to
// keep the exact characters being matched unambiguous and easy to verify.
function isStrippableControlChar(code: number): boolean {
  const TAB = 9;
  const LF = 10;
  const CR = 13;
  if (code === TAB || code === LF || code === CR) return false;
  if (code <= 31) return true; // remaining C0 controls, including NUL (0)
  if (code === 127) return true; // DEL
  if (code >= 128 && code <= 159) return true; // C1 controls
  return false;
}

/** Strips null bytes/control characters (keeping \n \r \t) and trims. */
export function sanitizeText(raw: string): string {
  let out = "";
  for (const ch of raw) {
    if (!isStrippableControlChar(ch.codePointAt(0) ?? 0)) {
      out += ch;
    }
  }
  return out.trim();
}

/** Throws a clear, field-specific error if `value` exceeds `max` characters. */
export function assertMaxLength(value: string, max: number, label: string): void {
  if (value.length > max) {
    throw new Error(`${label} must be ${max} characters or fewer.`);
  }
}

export const MESSAGE_MAX_LENGTH = 4000;
export const USER_NAME_MAX_LENGTH = 80;
export const USER_COURSE_MAX_LENGTH = 100;
export const GROUP_NAME_MAX_LENGTH = 60;
export const GROUP_DESCRIPTION_MAX_LENGTH = 500;
export const ASSIGNMENT_TITLE_MAX_LENGTH = 200;
export const ASSIGNMENT_DESCRIPTION_MAX_LENGTH = 4000;
export const ANNOUNCEMENT_MAX_LENGTH = 2000;
export const POLL_QUESTION_MAX_LENGTH = 300;
export const POLL_OPTION_MAX_LENGTH = 100;
