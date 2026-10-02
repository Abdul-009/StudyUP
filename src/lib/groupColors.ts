// Exact values from design/reference.html's :root block. Coral (#FF6952) is
// intentionally excluded from the rotation - it's reserved as a semantic
// alert color (due-soon/overdue dates, unread indicators) and must never be
// assigned as a group accent color, or it would lose its meaning as a warning.
export const GROUP_COLOR_PALETTE = [
  "#16A34A", // green
  "#3B82F6", // blue
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#D97706", // amber
  "#0891B2", // cyan
  "#475569", // slate
] as const;

// The earlier palette was five shades of green plus a default cyan, so groups
// were indistinguishable. Groups still holding one of those values get a
// stable colour from the new palette, derived from their id, until someone
// picks one explicitly in group settings.
const LEGACY_COLORS = new Set(["#1AA76B", "#4E9270", "#8A9A2E", "#159C8C", "#2F6B4C", "#06B6D4"]);

// Colours for a whole set of groups at once: explicitly chosen colours are kept,
// and groups still on a legacy colour are spread across the palette so no two
// of them share one (while there are colours left). Deterministic: the same set
// always gives the same result, so every page agrees.
export function assignGroupColors(
  groups: { id: string; accentColor: string | null | undefined }[],
): Record<string, string> {
  const result: Record<string, string> = {};
  const used = new Set<string>();

  for (const group of groups) {
    if (group.accentColor && !LEGACY_COLORS.has(group.accentColor.toUpperCase())) {
      result[group.id] = group.accentColor;
      used.add(group.accentColor.toUpperCase());
    }
  }

  const legacy = groups.filter((group) => !(group.id in result)).sort((a, b) => a.id.localeCompare(b.id));
  for (const group of legacy) {
    const preferred = GROUP_COLOR_PALETTE.indexOf(resolveGroupColor(group.id, null) as (typeof GROUP_COLOR_PALETTE)[number]);
    let chosen: string = GROUP_COLOR_PALETTE[preferred];
    for (let step = 0; step < GROUP_COLOR_PALETTE.length; step += 1) {
      const candidate = GROUP_COLOR_PALETTE[(preferred + step) % GROUP_COLOR_PALETTE.length];
      if (!used.has(candidate.toUpperCase())) {
        chosen = candidate;
        break;
      }
    }
    result[group.id] = chosen;
    used.add(chosen.toUpperCase());
  }

  return result;
}

export function resolveGroupColor(groupId: string, stored: string | null | undefined): string {
  if (stored && !LEGACY_COLORS.has(stored.toUpperCase())) return stored;
  let hash = 0;
  for (let i = 0; i < groupId.length; i += 1) hash = (hash * 31 + groupId.charCodeAt(i)) >>> 0;
  return GROUP_COLOR_PALETTE[hash % GROUP_COLOR_PALETTE.length];
}

// Fixed light-tint pairing per color, straight from reference.html (each
// group color has its own hand-picked tint rather than a generic mix).
const COLOR_TINTS: Record<string, string> = {
  "#16A34A": "#DCF5E4",
  "#3B82F6": "#E0ECFF",
  "#8B5CF6": "#EDE5FF",
  "#EC4899": "#FCE4F1",
  "#D97706": "#FBEBD3",
  "#0891B2": "#D9F1F7",
  "#475569": "#E4E8EE",
  "#1AA76B": "#E1F5EC", // indigo-tint
  "#4E9270": "#E4F1EA", // sage-tint
  "#8A9A2E": "#F1F5DA", // sunflower-tint
  "#159C8C": "#DEF2EF", // teal-tint
  "#2F6B4C": "#E1EDEA", // plum-tint
  "#FF6952": "#FFE9E5", // coral-tint
};

export function leastUsedColor(existingColors: string[]): string {
  const counts = new Map<string, number>(GROUP_COLOR_PALETTE.map((color) => [color, 0]));

  for (const color of existingColors) {
    if (counts.has(color)) {
      counts.set(color, (counts.get(color) ?? 0) + 1);
    }
  }

  let bestColor: string = GROUP_COLOR_PALETTE[0];
  let bestCount = Infinity;

  for (const color of GROUP_COLOR_PALETTE) {
    const count = counts.get(color) ?? 0;
    if (count < bestCount) {
      bestCount = count;
      bestColor = color;
    }
  }

  return bestColor;
}

export function tintColor(hex: string, whiteMix = 0.55): string {
  const known = COLOR_TINTS[hex.toUpperCase()];
  if (known) {
    return known;
  }

  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.substring(0, 2), 16);
  const g = parseInt(normalized.substring(2, 4), 16);
  const b = parseInt(normalized.substring(4, 6), 16);

  const mix = (channel: number) => Math.round(channel * (1 - whiteMix) + 255 * whiteMix);

  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}
