import type { CSSProperties } from "react";

/**
 * Props for a Recharts <Tooltip> that stays in one corner of the chart
 * instead of chasing the cursor. Spread onto <Tooltip>.
 *
 * Recharts positions its tooltip wrapper with an inline `transform`, eased
 * over 400ms by default — that easing is the "slow, laggy" follow. The
 * wrapper's inline style is merged last, so overriding `transform` and
 * `transition` there pins it in place; `top`/`right` then anchor it to the
 * chart's own box. Use "bottom-right" for horizontal bar charts, where the
 * longest bar runs along the top.
 */
export function fixedTooltipProps(corner: "top-right" | "bottom-right" = "top-right") {
  const wrapperStyle: CSSProperties = {
    transform: "none",
    transition: "none",
    left: "auto",
    right: 8,
    ...(corner === "top-right" ? { top: 4 } : { top: "auto", bottom: 32 }),
  };
  return { wrapperStyle, isAnimationActive: false } as const;
}
