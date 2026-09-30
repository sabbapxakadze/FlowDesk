import type { CSSProperties } from "react";

// Spread onto a Recharts <Tooltip>; see AnchoredTooltip for why.
export const anchoredTooltipProps = {
  wrapperStyle: {
    transform: "none",
    transition: "none",
    left: 0,
    top: 0,
  } satisfies CSSProperties,
  isAnimationActive: false,
} as const;
