import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useBreakdown } from "../../entities/analytics";
import { EmptyState, ErrorText, Skeleton, STATUS_LABELS } from "../../shared/ui";

type Row = { name: string; count: number };

type TooltipProps = {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: Row }>;
};

// Hand-built from semantic tokens, same reason as the other charts: the
// library default is a hardcoded white box that ignores dark mode.
function ChartTooltip({ active, payload }: TooltipProps) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm shadow-sm">
      <p className="text-xs text-[var(--color-text-muted)]">{row.name}</p>
      <p className="font-medium">
        {row.count} {row.count === 1 ? "issue" : "issues"}
      </p>
    </div>
  );
}

const AXIS_TICK = { fill: "var(--color-chart-axis)", fontSize: 12 };

/**
 * One single-series bar chart with a text summary and a table view. `rows`
 * lays the bars out horizontally (label names are long); columns otherwise.
 * One chart color for both breakdowns: the names sit on the axis, so color
 * would add no information (and the status tokens are too light on white to
 * work as graphics — see ADR 0012).
 */
function BarSection({
  title,
  data,
  layout,
  summary,
  columnHeader,
}: {
  title: string;
  data: Row[];
  layout: "columns" | "rows";
  summary: string;
  columnHeader: string;
}) {
  const [showTable, setShowTable] = useState(false);
  const height = layout === "rows" ? Math.max(160, data.length * 36 + 32) : 200;

  return (
    <section>
      <h3 className="mb-2 font-medium">{title}</h3>
      <div role="img" aria-label={summary} style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          {layout === "columns" ? (
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" />
              <XAxis dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: "var(--color-chart-grid)" }} interval={0} />
              <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--color-chart-grid)", opacity: 0.5 }} />
              <Bar dataKey="count" fill="var(--color-chart-primary)" radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
            </BarChart>
          ) : (
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid horizontal={false} stroke="var(--color-chart-grid)" />
              <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: "var(--color-chart-grid)" }} />
              <YAxis type="category" dataKey="name" width={96} tick={AXIS_TICK} tickLine={false} axisLine={false} interval={0} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--color-chart-grid)", opacity: 0.5 }} />
              <Bar dataKey="count" fill="var(--color-chart-primary)" radius={[0, 4, 4, 0]} maxBarSize={24} isAnimationActive={false} />
            </BarChart>
          )}
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
      {showTable && (
        <table className="mt-2 w-full max-w-xs text-left text-sm">
          <thead>
            <tr className="text-[var(--color-text-muted)]">
              <th className="py-1 font-medium">{columnHeader}</th>
              <th className="py-1 font-medium">Issues</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.name} className="border-t border-[var(--color-border-default)]">
                <td className="py-1">{row.name}</td>
                <td className="py-1">{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/**
 * A snapshot of where the work is right now (ADR 0012), not a history: it
 * reads current status and labels. Two gaps are shown rather than hidden —
 * open issues with no label, and labels past the top 10 — and the copy says
 * outright that label counts are not additive.
 */
export function BreakdownCharts({ organizationId, projectId }: { organizationId: string; projectId: string }) {
  const { data, isPending, isError, error } = useBreakdown(organizationId, projectId);

  if (isPending) return <Skeleton className="h-64 w-full" />;
  if (isError) return <ErrorText>Failed to load breakdown: {error.message}</ErrorText>;

  if (data.total === 0) return <EmptyState>No issues in this project yet.</EmptyState>;

  const statusRows: Row[] = data.byStatus.map((row) => ({ name: STATUS_LABELS[row.status], count: row.count }));
  const statusSummary = `Issues by status: ${statusRows.map((r) => `${r.name} ${r.count}`).join(", ")}; ${data.total} in total.`;
  const labelRows: Row[] = data.byLabel.map((row) => ({ name: row.name, count: row.count }));
  const labelSummary =
    labelRows.length === 0
      ? "No open issue carries a label."
      : `Open issues by label: ${labelRows.map((r) => `${r.name} ${r.count}`).join(", ")}.`;

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <BarSection title="By status" data={statusRows} layout="columns" summary={statusSummary} columnHeader="Status" />
      <div>
        {labelRows.length === 0 ? (
          <>
            <h3 className="mb-2 font-medium">Open issues by label</h3>
            <EmptyState>No open issue carries a label.</EmptyState>
          </>
        ) : (
          <BarSection title="Open issues by label" data={labelRows} layout="rows" summary={labelSummary} columnHeader="Label" />
        )}
        <div className="mt-2 flex flex-col gap-0.5 text-sm text-[var(--color-text-muted)]">
          <p>An issue with two labels is counted under both, so these can add up to more than {data.openTotal}.</p>
          {data.unlabeled > 0 && <p>{data.unlabeled} open issues have no label.</p>}
          {data.hiddenLabels > 0 && <p>{data.hiddenLabels} more labels not shown.</p>}
        </div>
      </div>
    </div>
  );
}
