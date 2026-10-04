import { useSearchParams } from "react-router";
import { useVelocity } from "../../entities/analytics";
import { useCurrentProject } from "../../entities/project";
import { useAuth } from "../../shared/auth/useAuth";
import { Card, Page, PageHeader, Select } from "../../shared/ui";
import { BreakdownCharts } from "../../widgets/breakdown-charts";
import { CycleTimeChart } from "../../widgets/cycle-time-chart";
import { ThroughputChart } from "../../widgets/throughput-chart";
import { VelocityChart } from "../../widgets/velocity-chart";

// The range lives in the URL (?weeks=, ?sprints=), same convention as the
// issue list's ?status=/?order=: a bookmarked or shared link reproduces the
// same dashboard. Only these values are offered; anything else in the URL
// (a hand-edited ?weeks=999, ?weeks=abc) falls back to the default instead of
// breaking the page. The API validates its own bounds independently.
const WEEKS_CHOICES = [4, 12, 26, 52] as const;
const DEFAULT_WEEKS = 12;
const SPRINT_CHOICES = [4, 8, 12] as const;
const DEFAULT_SPRINTS = 8;

// Offering "Last 12 sprints" when only 6 exist looks broken: it changes
// nothing. A choice is shown only while the next smaller one hasn't already
// covered every completed sprint, so with 6 sprints the list is 4 and 8.
function visibleSprintChoices(completedSprints: number | undefined): readonly number[] {
  if (completedSprints === undefined) return SPRINT_CHOICES;
  return SPRINT_CHOICES.filter((_, i) => i === 0 || SPRINT_CHOICES[i - 1]! < completedSprints);
}

function parseChoice(raw: string | null, allowed: readonly number[], fallback: number): number {
  const value = Number(raw);
  return allowed.includes(value) ? value : fallback;
}

export function ProjectAnalyticsPage() {
  const { organization } = useAuth();
  const project = useCurrentProject();
  const projectId = project.id;
  const [searchParams, setSearchParams] = useSearchParams();

  const weeks = parseChoice(searchParams.get("weeks"), WEEKS_CHOICES, DEFAULT_WEEKS);
  const requestedSprints = parseChoice(searchParams.get("sprints"), SPRINT_CHOICES, DEFAULT_SPRINTS);

  // Asks for the largest window once just to learn how many completed sprints
  // exist; the velocity widget then fetches its own (smaller) window.
  const { data: allVelocity } = useVelocity(
    organization!.id,
    projectId,
    SPRINT_CHOICES[SPRINT_CHOICES.length - 1]!,
  );
  const sprintChoices = visibleSprintChoices(allVelocity?.data.length);
  // A hand-edited or stale ?sprints= that is no longer offered snaps to the
  // nearest offered choice that still covers it.
  const sprints = sprintChoices.find((c) => c >= requestedSprints) ?? sprintChoices[sprintChoices.length - 1]!;

  // Choosing the default removes the param, so the plain URL stays clean.
  function setRange(name: "weeks" | "sprints", value: number, defaultValue: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === defaultValue) {
        next.delete(name);
      } else {
        next.set(name, String(value));
      }
      return next;
    });
  }

  return (
    <Page width="wide">
      <PageHeader eyebrow={project.name} title="Analytics" />

      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-[var(--color-text-muted)]">Period</span>
          <Select
            value={weeks}
            onChange={(e) => setRange("weeks", Number(e.target.value), DEFAULT_WEEKS)}
            className="w-auto"
            aria-label="Period for throughput and cycle time"
          >
            {WEEKS_CHOICES.map((choice) => (
              <option key={choice} value={choice}>
                Last {choice} weeks
              </option>
            ))}
          </Select>
        </label>
        {sprintChoices.length > 1 && (
          <label className="flex items-center gap-2">
            <span className="text-[var(--color-text-muted)]">Velocity</span>
            <Select
              value={sprints}
              onChange={(e) => setRange("sprints", Number(e.target.value), DEFAULT_SPRINTS)}
              className="w-auto"
              aria-label="Number of sprints for velocity"
            >
              {sprintChoices.map((choice) => (
                <option key={choice} value={choice}>
                  Last {choice} sprints
                </option>
              ))}
            </Select>
          </label>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <h2 className="mb-2 text-lg font-semibold">Throughput</h2>
          <p className="mb-3 text-sm text-[var(--color-text-muted)]">Issues completed per week.</p>
          <ThroughputChart organizationId={organization!.id} projectId={project.id} weeks={weeks} />
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="mb-2 text-lg font-semibold">Cycle time</h2>
            <p className="mb-3 text-sm text-[var(--color-text-muted)]">
              How long finished issues took, from first in progress to done.
            </p>
            <CycleTimeChart organizationId={organization!.id} projectId={project.id} weeks={weeks} />
          </Card>

          <Card>
            <h2 className="mb-2 text-lg font-semibold">Sprint velocity</h2>
            <p className="mb-3 text-sm text-[var(--color-text-muted)]">
              Issues completed in each recent sprint, as of the day it closed.
            </p>
            <VelocityChart organizationId={organization!.id} projectId={project.id} sprints={sprints} />
          </Card>
        </div>

        <Card>
          <h2 className="mb-2 text-lg font-semibold">Where the work is</h2>
          <p className="mb-3 text-sm text-[var(--color-text-muted)]">A snapshot of the project right now, not a history.</p>
          <BreakdownCharts organizationId={organization!.id} projectId={project.id} />
        </Card>
      </div>
    </Page>
  );
}
