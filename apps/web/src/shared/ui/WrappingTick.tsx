import { usePlotArea } from "recharts";

// Below this many pixels per category, a label with spaces is split onto two
// lines instead of colliding with its neighbours ("1-3 days" -> "1-3" / "days").
const MIN_ONE_LINE_BAND = 80;

/**
 * An x-axis tick for category axes with short multi-word labels. Pass it as
 * `tick={<WrappingTick count={rows.length} />}`; Recharts adds x, y and the
 * payload. Wide charts keep one line, narrow ones wrap at the last space.
 * The axis needs `height` for two lines (about 40) so nothing is clipped.
 */
export function WrappingTick({
  x = 0,
  y = 0,
  payload,
  count,
}: {
  x?: number;
  y?: number;
  payload?: { value: string | number };
  count: number;
}) {
  const plot = usePlotArea();
  const text = String(payload?.value ?? "");
  const band = plot ? plot.width / count : Infinity;
  const cut = text.lastIndexOf(" ");
  const lines = band < MIN_ONE_LINE_BAND && cut > 0 ? [text.slice(0, cut), text.slice(cut + 1)] : [text];

  return (
    <text x={x} y={y} textAnchor="middle" fill="var(--color-chart-axis)" fontSize={12}>
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? "0.9em" : "1.2em"}>
          {line}
        </tspan>
      ))}
    </text>
  );
}
