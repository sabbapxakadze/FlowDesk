import { SectionHeading } from "./SectionHeading";

/** Three steps, each one a thing the app really does today. */
const STEPS = [
  {
    title: "Create your organization",
    text: "Signing up gives you one. Invite teammates by email and give each a role: owner, admin, member or viewer.",
  },
  {
    title: "Add projects and issues",
    text: "Every project has a short key such as WEB, so issues read WEB-12. Add labels, priorities, due dates and assignees, and attach files.",
  },
  {
    title: "Plan it and follow it through",
    text: "Drag cards across the board, start and complete sprints, and watch throughput, cycle time and velocity build up from what really happened.",
  },
];

export function HowItWorks() {
  return (
    <section aria-labelledby="landing-how" className="mx-auto mt-20 w-full max-w-6xl px-4 sm:mt-28 sm:px-6">
      <SectionHeading id="landing-how" title="How it works">
        From an empty account to a team that knows what is next.
      </SectionHeading>
      <ol className="mt-10 grid gap-4 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="glass-card rounded-[var(--radius-card)] p-6 sm:p-7">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-bg-action-create)] text-sm font-semibold text-[var(--color-text-on-action-strong)]"
            >
              {index + 1}
            </span>
            <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
            <p className="mt-2 text-[var(--color-text-muted)]">{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
