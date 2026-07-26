// Exact values from design/reference.html's :root block. Coral (#FF6952) is
// intentionally excluded from the rotation - it's reserved as a semantic
// alert color (due-soon/overdue dates, unread indicators) and must never be
// assigned as a group accent color, or it would lose its meaning as a warning.
export const GROUP_COLOR_PALETTE = [
  "#1AA76B", // indigo
  "#4E9270", // sage
  "#8A9A2E", // sunflower
  "#159C8C", // teal
  "#2F6B4C", // plum
] as const;

// Fixed light-tint pairing per color, straight from reference.html (each
// group color has its own hand-picked tint rather than a generic mix).
const COLOR_TINTS: Record<string, string> = {
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
