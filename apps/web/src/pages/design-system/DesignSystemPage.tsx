import { useState } from "react";
import type { ReactNode } from "react";
import type { IssueStatus } from "@flowdesk/contracts";
import {
  Button,
  Card,
  ColumnHeader,
  EmptyState,
  ErrorText,
  Field,
  Input,
  Page,
  PageHeader,
  Select,
  Skeleton,
  StatusBadge,
  Textarea,
  ThemeSwitch,
} from "../../shared/ui";

type SwatchKind = "fill" | "text" | "border";

type Token = {
  name: string;
  cssVar: string;
  kind: SwatchKind;
  /** For a text token: the background it is drawn on (defaults to bg-surface). */
  on?: string;
};

type TokenGroup = { title: string; note?: string; tokens: Token[] };

/**
 * Hardcoded, not parsed from semantic.css at runtime: the list is small and a
 * drift between it and the real token file is a visible diff to catch in
 * review. Swatches are styled with an inline `var(--token)`, so this page
 * needs no Tailwind class lookup tables for tokens (the two primitive scales
 * below still do, because Tailwind must see their class names).
 */
const TOKEN_GROUPS: TokenGroup[] = [
  {
    title: "Surfaces and text",
    tokens: [
      { name: "bg-page", cssVar: "--color-bg-page", kind: "fill" },
      { name: "bg-surface", cssVar: "--color-bg-surface", kind: "fill" },
      { name: "bg-action-primary", cssVar: "--color-bg-action-primary", kind: "fill" },
      { name: "text-default", cssVar: "--color-text-default", kind: "text" },
      { name: "text-muted", cssVar: "--color-text-muted", kind: "text" },
      { name: "text-link", cssVar: "--color-text-link", kind: "text" },
      { name: "text-danger", cssVar: "--color-text-danger", kind: "text" },
      { name: "text-warning", cssVar: "--color-text-warning", kind: "text" },
      {
        name: "text-on-action",
        cssVar: "--color-text-on-action",
        kind: "text",
        on: "--color-bg-action-primary",
      },
    ],
  },
  {
    title: "Borders",
    note: "border-input is the control boundary: measured at 3:1 or better against the surface in both modes (ADR 0015).",
    tokens: [
      { name: "border-default", cssVar: "--color-border-default", kind: "border" },
      { name: "border-input", cssVar: "--color-border-input", kind: "border" },
      { name: "border-focus", cssVar: "--color-border-focus", kind: "border" },
    ],
  },
  {
    title: "Status",
    note: "A fixed three-state enum, never the only carrier of meaning: every use also shows a label.",
    tokens: [
      { name: "status-todo", cssVar: "--color-status-todo", kind: "fill" },
      { name: "status-in-progress", cssVar: "--color-status-in-progress", kind: "fill" },
      { name: "status-done", cssVar: "--color-status-done", kind: "fill" },
    ],
  },
  {
    title: "Charts",
    tokens: [
      { name: "chart-primary", cssVar: "--color-chart-primary", kind: "fill" },
      { name: "chart-grid", cssVar: "--color-chart-grid", kind: "fill" },
      { name: "chart-axis", cssVar: "--color-chart-axis", kind: "fill" },
    ],
  },
  {
    title: "Navigation shell",
    note: "Dark in light mode on purpose (ADR 0014); separated by a border in dark mode.",
    tokens: [
      { name: "bg-sidebar", cssVar: "--color-bg-sidebar", kind: "fill" },
      { name: "bg-sidebar-active", cssVar: "--color-bg-sidebar-active", kind: "fill" },
      { name: "border-sidebar", cssVar: "--color-border-sidebar", kind: "border" },
      { name: "text-sidebar", cssVar: "--color-text-sidebar", kind: "text", on: "--color-bg-sidebar" },
      {
        name: "text-sidebar-active",
        cssVar: "--color-text-sidebar-active",
        kind: "text",
        on: "--color-bg-sidebar-active",
      },
    ],
  },
];

const ACCENT_SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
const NEUTRAL_SHADES = [50, 100, 200, 300, 400, 450, 500, 600, 700, 800, 900, 950] as const;

/** Literal, complete class strings: Tailwind's scanner reads source text, so a
 * template literal built from the shade would never be generated. */
const accentBgClassByShade: Record<(typeof ACCENT_SHADES)[number], string> = {
  50: "bg-accent-50",
  100: "bg-accent-100",
  200: "bg-accent-200",
  300: "bg-accent-300",
  400: "bg-accent-400",
  500: "bg-accent-500",
  600: "bg-accent-600",
  700: "bg-accent-700",
  800: "bg-accent-800",
  900: "bg-accent-900",
  950: "bg-accent-950",
};

const neutralBgClassByShade: Record<(typeof NEUTRAL_SHADES)[number], string> = {
  50: "bg-neutral-50",
  100: "bg-neutral-100",
  200: "bg-neutral-200",
  300: "bg-neutral-300",
  400: "bg-neutral-400",
  450: "bg-neutral-450",
  500: "bg-neutral-500",
  600: "bg-neutral-600",
  700: "bg-neutral-700",
  800: "bg-neutral-800",
  900: "bg-neutral-900",
  950: "bg-neutral-950",
};

const ALL_STATUSES: IssueStatus[] = ["todo", "in_progress", "done"];

function TokenSwatch({ token }: { token: Token }) {
  return (
    <div className="flex items-center gap-3">
      {token.kind === "fill" && (
        <div
          className="h-10 w-10 shrink-0 rounded-[var(--radius-control)] border border-[var(--color-border-default)]"
          style={{ background: `var(${token.cssVar})` }}
        />
      )}
      {token.kind === "text" && (
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border-default)]"
          style={{ background: `var(${token.on ?? "--color-bg-surface"})` }}
        >
          <span className="font-medium" style={{ color: `var(${token.cssVar})` }}>
            Aa
          </span>
        </div>
      )}
      {token.kind === "border" && (
        <div
          className="h-10 w-10 shrink-0 rounded-[var(--radius-control)] border-2 bg-[var(--color-bg-surface)]"
          style={{ borderColor: `var(${token.cssVar})` }}
        />
      )}
      <div className="text-sm">
        <p className="font-medium">{token.name}</p>
        <p className="text-[var(--color-text-muted)]">{token.cssVar}</p>
      </div>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-1 text-lg font-semibold">{title}</h2>
      {note && <p className="mb-3 text-sm text-[var(--color-text-muted)]">{note}</p>}
      {!note && <div className="mb-3" />}
      {children}
    </section>
  );
}

function Scale({ shades, classes, label }: { shades: readonly number[]; classes: Record<number, string>; label: string }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{label}</p>
      <div className="flex flex-wrap gap-2">
        {shades.map((shade) => (
          <div key={shade} className="text-center text-xs">
            <div className={`mb-1 h-10 w-10 rounded-[var(--radius-control)] ${classes[shade]}`} />
            {shade}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Public: this documents the UI system, not app data, and "portfolio
 * material" (ADR 0006's own phrase) means someone without an account should be
 * able to see it. See App.tsx: not wrapped in RequireAuth, so no sidebar.
 *
 * The theme switch is the same shared ThemeSwitch the sidebar uses, so this
 * page and the app can never disagree about the theme.
 */
export function DesignSystemPage() {
  const [showFieldError, setShowFieldError] = useState(false);

  return (
    <Page>
      <PageHeader title="Design system">
        <p className="mb-3 text-sm text-[var(--color-text-muted)]">
          Every semantic token and base component, live. Switch the theme here or in the sidebar, or
          leave it on System to follow your device.
        </p>
        <ThemeSwitch />
      </PageHeader>

      <h2 className="mb-6 border-b border-[var(--color-border-default)] pb-2 text-sm font-semibold tracking-wide text-[var(--color-text-muted)] uppercase">
        Foundations
      </h2>

      {TOKEN_GROUPS.map((group) => (
        <Section key={group.title} title={group.title} note={group.note}>
          <div className="grid gap-3 sm:grid-cols-2">
            {group.tokens.map((token) => (
              <TokenSwatch key={token.cssVar} token={token} />
            ))}
          </div>
        </Section>
      ))}

      <Section
        title="Primitive scales"
        note="Components never use these directly; the semantic tokens above point at them. Swapping a palette means repointing tokens or editing these ramps."
      >
        <div className="flex flex-col gap-4">
          <Scale shades={NEUTRAL_SHADES} classes={neutralBgClassByShade} label="Neutral gray (450 is FlowDesk's added stop)" />
          <Scale shades={ACCENT_SHADES} classes={accentBgClassByShade} label="Accent: slate-teal (FlowDesk's own)" />
        </div>
      </Section>

      <Section title="Typography" note="Inter for everything you read and scan; Newsreader only for page titles and big numbers, at normal weight.">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-xs text-[var(--color-text-muted)]">Display: Newsreader, 3xl, normal</p>
            <p className="font-display text-3xl font-normal">Projects and 3.5 days</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-muted)]">Section heading: Inter, lg, semibold</p>
            <p className="text-lg font-semibold">Where the work is</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-muted)]">Body: Inter, base</p>
            <p>Issues move from Todo to Done as the sprint progresses.</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-muted)]">Small and meta: Inter, sm and xs, muted</p>
            <p className="text-sm text-[var(--color-text-muted)]">Analytics Demo, ANL-29</p>
          </div>
        </div>
      </Section>

      <Section title="Radius tokens">
        <div className="flex gap-6">
          <div className="text-sm">
            <div className="mb-2 h-16 w-16 rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]" />
            <p className="font-medium">radius-card</p>
            <p className="text-[var(--color-text-muted)]">--radius-card</p>
          </div>
          <div className="text-sm">
            <div className="mb-2 h-16 w-16 rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]" />
            <p className="font-medium">radius-control</p>
            <p className="text-[var(--color-text-muted)]">--radius-control</p>
          </div>
        </div>
      </Section>

      <h2 className="mt-12 mb-6 border-b border-[var(--color-border-default)] pb-2 text-sm font-semibold tracking-wide text-[var(--color-text-muted)] uppercase">
        Components
      </h2>

      <Section title="Button">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="md">
            Primary md
          </Button>
          <Button variant="primary" size="sm">
            Primary sm
          </Button>
          <Button variant="secondary" size="md">
            Secondary md
          </Button>
          <Button variant="secondary" size="sm">
            Secondary sm
          </Button>
          <Button variant="primary" size="md" disabled>
            Disabled
          </Button>
        </div>
        <div className="mt-3 max-w-sm">
          <Button fullWidth>Full width</Button>
        </div>
      </Section>

      <Section title="Input, Textarea, Select">
        <div className="flex max-w-sm flex-col gap-3">
          <Input placeholder="A text input" />
          <Input placeholder="Invalid (aria-invalid)" aria-invalid="true" />
          <Input placeholder="Disabled" disabled />
          <Textarea placeholder="A textarea" rows={3} />
          <Select>
            <option>Option one</option>
            <option>Option two</option>
          </Select>
        </div>
      </Section>

      <Section title="Field">
        <div className="flex max-w-sm flex-col gap-3">
          <Field label="Clean field">
            <Input placeholder="No error" />
          </Field>
          <Field
            label="Field with an error"
            error={showFieldError ? "This is what a validation error looks like." : undefined}
          >
            <Input
              placeholder="Focus me to show the error"
              aria-invalid={showFieldError ? true : undefined}
              onFocus={() => setShowFieldError(true)}
            />
          </Field>
        </div>
      </Section>

      <Section title="Card">
        <Card className="max-w-sm">
          <p className="font-medium">A card</p>
          <p className="text-sm text-[var(--color-text-muted)]">
            The elevated container used for list items and boxed content: a surface and a soft shadow, no border.
          </p>
        </Card>
      </Section>

      <Section title="Status and column headers">
        <div className="flex flex-wrap items-start gap-8">
          <div className="flex flex-col gap-2">
            {ALL_STATUSES.map((status) => (
              <StatusBadge key={status} status={status} />
            ))}
          </div>
          <div>
            <ColumnHeader status="todo" count={3} />
            <ColumnHeader status="in_progress" count={12} />
            <ColumnHeader label="Backlog" count={40} />
          </div>
        </div>
      </Section>

      <Section title="Empty and loading states">
        <div className="flex max-w-sm flex-col gap-3">
          <EmptyState>Inline: a short message in place of a list.</EmptyState>
          <EmptyState block>Block: a whole list or drop zone is empty.</EmptyState>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
      </Section>

      <Section title="ErrorText">
        <ErrorText>This is a standalone mutation-level error message.</ErrorText>
      </Section>

      <Section
        title="Page and PageHeader"
        note="Every logged-in page renders inside Page (the one main landmark, responsive padding, a reading or wide width) and starts with PageHeader (an eyebrow, the serif title, an optional back link and a meta row). They are used on every screen of the app, so they are described here rather than duplicated as a second h1."
      >
        <div />
      </Section>

      <Section title="Navigation shell preview" note="The sidebar's tokens in use: one inactive item, one active item.">
        <div className="w-56 rounded-[var(--radius-card)] border border-[var(--color-border-sidebar)] bg-[var(--color-bg-sidebar)] p-3">
          <p className="mb-2 px-2.5 font-display text-2xl text-[var(--color-text-sidebar-active)]">FlowDesk</p>
          <p className="rounded-[var(--radius-control)] px-2.5 py-1.5 text-sm text-[var(--color-text-sidebar)]">Projects</p>
          <p className="rounded-[var(--radius-control)] bg-[var(--color-bg-sidebar-active)] px-2.5 py-1.5 text-sm text-[var(--color-text-sidebar-active)]">
            Board
          </p>
        </div>
      </Section>
    </Page>
  );
}
