import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useVelocity, type VelocitySprint } from "../../entities/analytics";
import { EmptyState, ErrorText, fixedTooltipProps, Skeleton } from "../../shared/ui";

function Stat({ label, value, lead = false }: { label: string; value: string; lead?: boolean }) {
  return (
    <div>
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
      <p className={lead ? "text-2xl font-semibold" : "text-lg"}>{value}</p>
    </div>
  );
}

type TooltipProps = {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: VelocitySprint }>;
};

// Hand-built from semantic tokens, same reason as the other charts: the
// library default is a hardcoded white box that ignores dark mode.
function ChartTooltip({ active, payload }: TooltipProps) {
  const sprint = payload?.[0]?.payload;
  if (!active || !sprint) return null;
  const carriedOver = sprint.committed - sprint.completed;
  return (
    <div className="rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm shadow-sm">
      <p className="text-xs text-[var(--color-text-muted)]">{sprint.name}</p>
      <p className="font-medium">
        {sprint.completed} of {sprint.committed} completed
      </p>
      {carriedOver > 0 && <p className="text-xs text-[var(--color-text-muted)]">{carriedOver} carried over</p>}
    </div>
  );
}

/**
 * One series (completed per sprint), so no legend box. Committed and
 * carried over ride in the tooltip and table rather than as a second
 * stacked series: it keeps the chart to the one number velocity is
 * (issues completed) and the headline honest. Both numbers are as of each
 * sprint's close — see ADR 0011.
 */
export function VelocityChart({
  organizationId,
  projectId,
  sprints,
}: {
  organizationId: string;
  projectId: string;
  sprints: number;
}) {
  const { data, isPending, isError, error } = useVelocity(organizationId, projectId, sprints);
  const [showTable, setShowTable] = useState(false);

  if (isPending) return <Skeleton className="h-64 w-full" />;
  if (isError) return <ErrorText>Failed to load velocity: {error.message}</ErrorText>;

  const { summary, data: rows } = data;
  if (rows.length === 0) {
    return <EmptyState>No sprints have been completed yet.</EmptyState>;
  }

  const last = rows[rows.length - 1]!;
  const summaryText = `Velocity over the last ${rows.length} completed sprints: an average of ${summary.averageCompleted} issues completed per sprint; the latest, ${last.name}, completed ${last.completed} of ${last.committed}.`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-x-8 gap-y-2">
        <Stat label="Average per sprint" value={`${summary.averageCompleted} issues`} lead />
        <Stat label={`Latest (${last.name})`} value={`${last.completed} of ${last.committed}`} />
        <Stat label="Carried over from latest" value={String(last.committed - last.completed)} />
      </div>

      <div role="img" aria-label={summaryText} className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" />
            <XAxis
              dataKey="name"
              tick={{ fill: "var(--color-chart-axis)", fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-chart-grid)" }}
              interval={0}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: "var(--color-chart-axis)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--color-chart-grid)", opacity: 0.5 }} {...fixedTooltipProps()} />
            <Bar
              dataKey="completed"
              fill="var(--color-chart-primary)"
              radius={[4, 4, 0, 0]}
              maxBarSize={48}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">{summaryText}</p>
      <button
        type="button"
        onClick={() => setShowTable((open) => !open)}
        className="mt-1 text-sm text-[var(--color-text-link)] underline"
      >
        {showTable ? "Hide table" : "View as table"}
      </button>
      {showTable && (
        <table className="mt-2 w-full max-w-md text-left text-sm">
          <thead>
            <tr className="text-[var(--color-text-muted)]">
              <th className="py-1 font-medium">Sprint</th>
              <th className="py-1 font-medium">Completed</th>
              <th className="py-1 font-medium">Committed</th>
              <th className="py-1 font-medium">Carried over</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.sprintId} className="border-t border-[var(--color-border-default)]">
                <td className="py-1">{row.name}</td>
                <td className="py-1">{row.completed}</td>
                <td className="py-1">{row.committed}</td>
                <td className="py-1">{row.committed - row.completed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
