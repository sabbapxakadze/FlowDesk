import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useChartWidth, usePlotArea } from "recharts";

/**
 * A Recharts tooltip that sits at the hovered bar instead of chasing the
 * cursor. Two pieces, used together:
 *
 * - `anchoredTooltipProps` (anchoredTooltipProps.ts) goes on <Tooltip>. Recharts positions its
 *   tooltip wrapper with an inline `transform`, eased over 400ms by default
 *   (that easing was the "slow follow"). The wrapper's inline style is merged
 *   last, so resetting `transform`/`transition` there parks the wrapper at
 *   the chart's top-left corner, where it takes no space, and lets
 *   <AnchoredTooltip> place its own box inside it.
 * - <AnchoredTooltip> wraps the tooltip's box. For a column chart the box
 *   sits above the hovered column, centered on it, above the plot area so it
 *   never covers a bar. For a row chart it sits inside the plot at the right
 *   edge of the hovered row. `coordinate` is what Recharts gives the content:
 *   along the category axis it is the centre of the hovered band (that is how
 *   a whole column or row is the hover target, not just the painted bar); it
 *   also works for zero-height bars and for keyboard focus.
 */
const GAP = 6;

export function AnchoredTooltip({
  coordinate,
  orientation,
  children,
}: {
  coordinate: { x: number; y: number } | undefined;
  orientation: "column" | "row";
  children: ReactNode;
}) {
  const plot = usePlotArea();
  const chartWidth = useChartWidth();
  const ref = useRef<HTMLDivElement>(null);

  // The box's own width decides how far it can slide before it would leave
  // the chart, so clamp after it has rendered and can be measured.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !coordinate || !plot || chartWidth == null) return;
    const width = el.offsetWidth;
    if (orientation === "column") {
      const left = Math.min(
        Math.max(coordinate.x - width / 2, 0),
        Math.max(chartWidth - width, 0),
      );
      el.style.left = `${left}px`;
      el.style.top = `${plot.y - GAP}px`;
      el.style.transform = "translateY(-100%)";
    } else {
      el.style.left = `${plot.x + plot.width - GAP}px`;
      el.style.top = `${coordinate.y}px`;
      el.style.transform = "translate(-100%, -50%)";
    }
  });

  if (!coordinate || !plot) return null;
  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "max-content",
        pointerEvents: "none",
      }}
    >
      {children}
    </div>
  );
}
