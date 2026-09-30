import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useThroughput, type ThroughputPoint } from "../../entities/analytics";
import { AnchoredTooltip, EmptyState, ErrorText, anchoredTooltipProps, Skeleton } from "../../shared/ui";

// weekStart is a plain UTC date (Monday). Formatted in UTC on purpose: a
// local-timezone format would show "Sep 27" for Monday Sep 28 west of UTC.
function formatWeek(weekStart: string): string {
  return new Date(`${weekStart}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

type TooltipProps = {
  active?: boolean;
  coordinate?: { x: number; y: number };
  payload?: ReadonlyArray<{ payload?: ThroughputPoint }>;
};

// A hand-built tooltip (semantic tokens only) instead of recharts' default,
// which ships its own hardcoded white box and would ignore dark mode.
function ChartTooltip({ active, coordinate, payload }: TooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <AnchoredTooltip coordinate={coordinate} orientation="column">
        <div className="rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm shadow-sm">
        <p className="text-xs text-[var(--color-text-muted)]">Week of {formatWeek(point.weekStart)}</p>
        <p className="font-medium">
          {point.completed} {point.completed === 1 ? "issue" : "issues"} completed
        </p>
      </div>
    </AnchoredTooltip>
  );
}

function ThroughputTable({ points }: { points: ThroughputPoint[] }) {
  return (
    <table className="mt-2 w-full max-w-sm text-left text-sm">
      <thead>
        <tr className="text-[var(--color-text-muted)]">
          <th className="py-1 font-medium">Week of</th>
          <th className="py-1 font-medium">Completed</th>
        </tr>
      </thead>
      <tbody>
        {points.map((point) => (
          <tr key={point.weekStart} className="border-t border-[var(--color-border-default)]">
            <td className="py-1">{formatWeek(point.weekStart)}</td>
            <td className="py-1">{point.completed}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * One series, so no legend box — the heading names it. Colors come from
 * the --color-chart-* semantic tokens (dark mode redefines them; nothing
 * here is theme-aware). The SVG is described by a text summary and a
 * table view exists, so the numbers never depend on seeing the bars.
 */
export function ThroughputChart({
  organizationId,
  projectId,
  weeks,
}: {
  organizationId: string;
  projectId: string;
  weeks: number;
}) {
  const { data, isPending, isError, error } = useThroughput(organizationId, projectId, weeks);
  const [showTable, setShowTable] = useState(false);

  if (isPending) return <Skeleton className="h-64 w-full" />;
  if (isError) return <ErrorText>Failed to load throughput: {error.message}</ErrorText>;

  const total = data.reduce((sum, point) => sum + point.completed, 0);
  if (total === 0) {
    return <EmptyState>No issues were completed in the last {weeks} weeks.</EmptyState>;
  }

  const summary = `Issues completed per week over the last ${weeks} weeks: ${total} in total.`;

  return (
    <div>
      <div role="img" aria-label={summary} className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" />
            <XAxis
              dataKey="weekStart"
              tickFormatter={formatWeek}
              tick={{ fill: "var(--color-chart-axis)", fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-chart-grid)" }}
              interval="preserveStartEnd"
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: "var(--color-chart-axis)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--color-chart-grid)", opacity: 0.5 }} {...anchoredTooltipProps} />
            <Bar
              dataKey="completed"
              fill="var(--color-chart-primary)"
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">{summary}</p>
      <button
        type="button"
        onClick={() => setShowTable((open) => !open)}
        className="mt-1 text-sm text-[var(--color-text-link)] underline"
      >
        {showTable ? "Hide table" : "View as table"}
      </button>
      {showTable && <ThroughputTable points={data} />}
    </div>
  );
}
