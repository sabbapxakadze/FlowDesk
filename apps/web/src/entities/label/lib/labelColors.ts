/**
 * Ten ready-made label colours, all dark enough for the white text on a label pill (about 4.5:1 or better by my calculation from the
 * Tailwind 600/700 shades; not measured in a browser). A label's colour is its own data, so these are plain hex values, not tokens.
 */
export const LABEL_COLORS: { name: string; hex: string }[] = [
  { name: "Teal", hex: "#0f766e" },
  { name: "Blue", hex: "#2563eb" },
  { name: "Indigo", hex: "#4f46e5" },
  { name: "Purple", hex: "#9333ea" },
  { name: "Pink", hex: "#db2777" },
  { name: "Red", hex: "#dc2626" },
  { name: "Orange", hex: "#c2410c" },
  { name: "Amber", hex: "#b45309" },
  { name: "Green", hex: "#15803d" },
  { name: "Slate", hex: "#475569" },
];
