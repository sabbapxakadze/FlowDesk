import { useState } from "react";
import type { ReactNode } from "react";
import type { IssueStatus } from "@flowdesk/contracts";
import { Button, Card, ErrorText, Field, Input, Select, StatusBadge, Textarea } from "../../shared/ui";

type ColorToken = {
  name: string;
  cssVar: string;
  category: "Background" | "Text" | "Border";
};

/**
 * Hardcoded, not parsed from semantic.css at runtime — 13 tokens is small
 * and stable, and a drift between this list and the real token file is a
 * visible diff to catch in review, not a hidden failure mode. See the
 * Phase 3.5 slice 4 plan's "Decisions" section.
 */
const colorTokens: ColorToken[] = [
  { name: "bg-page", cssVar: "--color-bg-page", category: "Background" },
  { name: "bg-surface", cssVar: "--color-bg-surface", category: "Background" },
  { name: "bg-action-primary", cssVar: "--color-bg-action-primary", category: "Background" },
  { name: "text-default", cssVar: "--color-text-default", category: "Text" },
  { name: "text-muted", cssVar: "--color-text-muted", category: "Text" },
  { name: "text-danger", cssVar: "--color-text-danger", category: "Text" },
  { name: "text-warning", cssVar: "--color-text-warning", category: "Text" },
  { name: "text-link", cssVar: "--color-text-link", category: "Text" },
  { name: "text-on-action", cssVar: "--color-text-on-action", category: "Text" },
  { name: "border-default", cssVar: "--color-border-default", category: "Border" },
  { name: "border-input", cssVar: "--color-border-input", category: "Border" },
  { name: "border-focus", cssVar: "--color-border-focus", category: "Border" },
];

const ACCENT_SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

/** Same reasoning as the class lookup tables below — a literal, complete
 * string per shade, not a template literal Tailwind's scanner can't see. */
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

const ALL_STATUSES: IssueStatus[] = ["todo", "in_progress", "done"];

/**
 * Tailwind's JIT scanner reads literal source text, not runtime-evaluated
 * strings — a template literal like `bg-[var(${token.cssVar})]` would
 * never be recognized as a real utility class, since the scanner never
 * sees the complete resolved string. Every class this page needs has to
 * exist as a literal, complete string somewhere in this file; these
 * lookup tables are that (found and fixed before this ever reached the
 * browser — see the Phase 3.5 slice 4 plan).
 */
const bgClassByVar: Record<string, string> = {
  "--color-bg-page": "bg-[var(--color-bg-page)]",
  "--color-bg-surface": "bg-[var(--color-bg-surface)]",
  "--color-bg-action-primary": "bg-[var(--color-bg-action-primary)]",
};

const textClassByVar: Record<string, string> = {
  "--color-text-default": "text-[var(--color-text-default)]",
  "--color-text-muted": "text-[var(--color-text-muted)]",
  "--color-text-danger": "text-[var(--color-text-danger)]",
  "--color-text-warning": "text-[var(--color-text-warning)]",
  "--color-text-link": "text-[var(--color-text-link)]",
  "--color-text-on-action": "text-[var(--color-text-on-action)]",
};

const borderClassByVar: Record<string, string> = {
  "--color-border-default": "border-[var(--color-border-default)]",
  "--color-border-input": "border-[var(--color-border-input)]",
};

/** The swatch is styled with the same real `bg-[var(--color-x)]`-style
 * utilities every component uses (slice 2) — looked up above rather than
 * built with a template literal, for the reason in the comment above. */
function TokenSwatch({ token }: { token: ColorToken }) {
  return (
    <div className="flex items-center gap-3">
      {token.category === "Background" && (
        <div
          className={`h-10 w-10 rounded-[var(--radius-control)] border border-[var(--color-border-default)] ${bgClassByVar[token.cssVar]}`}
        />
      )}
      {token.category === "Text" && (
        <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
          <span className={`font-medium ${textClassByVar[token.cssVar]}`}>Aa</span>
        </div>
      )}
      {token.category === "Border" && (
        <div
          className={`h-10 w-10 rounded-[var(--radius-control)] border-2 bg-[var(--color-bg-surface)] ${borderClassByVar[token.cssVar]}`}
        />
      )}
      <div className="text-sm">
        <p className="font-medium">{token.name}</p>
        <p className="text-[var(--color-text-muted)]">{token.cssVar}</p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Public — this documents the UI system, not app data, and "portfolio
 * material" (ADR 0006's own phrase) means someone without an account
 * should be able to see it. See App.tsx: not wrapped in RequireAuth.
 */
export function DesignSystemPage() {
  const [showFieldError, setShowFieldError] = useState(false);

  const byCategory = (category: ColorToken["category"]) =>
    colorTokens.filter((t) => t.category === category);

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="mb-1 text-2xl font-semibold">Design system</h1>
      <p className="mb-8 text-sm text-[var(--color-text-muted)]">
        Every semantic token and base component, live — toggle dark mode to see
        the whole system respond at once.
      </p>

      <Section title="Background tokens">
        <div className="flex flex-col gap-3">
          {byCategory("Background").map((t) => (
            <TokenSwatch key={t.cssVar} token={t} />
          ))}
        </div>
      </Section>

      <Section title="Text tokens">
        <div className="flex flex-col gap-3">
          {byCategory("Text").map((t) => (
            <TokenSwatch key={t.cssVar} token={t} />
          ))}
        </div>
      </Section>

      <Section title="Border tokens">
        <div className="flex flex-col gap-3">
          {byCategory("Border").map((t) => (
            <TokenSwatch key={t.cssVar} token={t} />
          ))}
        </div>
      </Section>

      <Section title="Accent primitive (FlowDesk's own)">
        <div className="flex flex-wrap gap-2">
          {ACCENT_SHADES.map((shade) => (
            <div key={shade} className="text-center text-xs">
              <div
                className={`mb-1 h-10 w-10 rounded-[var(--radius-control)] ${accentBgClassByShade[shade]}`}
              />
              {shade}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Status">
        <div className="flex gap-4">
          {ALL_STATUSES.map((status) => (
            <StatusBadge key={status} status={status} />
          ))}
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
      </Section>

      <Section title="Input">
        <Input placeholder="A text input" className="max-w-sm" />
      </Section>

      <Section title="Textarea">
        <Textarea placeholder="A textarea" rows={3} className="max-w-sm" />
      </Section>

      <Section title="Select">
        <Select className="max-w-sm">
          <option>Option one</option>
          <option>Option two</option>
        </Select>
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
              placeholder="Toggle the error below"
              onFocus={() => setShowFieldError(true)}
            />
          </Field>
        </div>
      </Section>

      <Section title="Card">
        <Card className="max-w-sm">
          <p className="font-medium">A card</p>
          <p className="text-sm text-[var(--color-text-muted)]">
            The bordered/rounded container used for list items and boxed content.
          </p>
        </Card>
      </Section>

      <Section title="ErrorText">
        <ErrorText>This is a standalone mutation-level error message.</ErrorText>
      </Section>
    </main>
  );
}
