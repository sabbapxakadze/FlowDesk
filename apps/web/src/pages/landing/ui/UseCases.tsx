import { SectionHeading } from "./SectionHeading";

/** Ways of working the app supports today, written as what a person does, not as claims about who uses it. */
const CASES = [
  {
    title: "Run a sprint",
    text: "Plan the sprint from the backlog, drag cards as the work moves, complete it, and see the sprint's velocity afterwards.",
  },
  {
    title: "Keep the backlog honest",
    text: "Sort by priority, filter by label or due date, and spot what is overdue before it catches you out.",
  },
  {
    title: "Hand work over cleanly",
    text: "Assign it, mention the person, attach what they need. Everyone involved is notified and sees the same history.",
  },
  {
    title: "Show progress without a spreadsheet",
    text: "Throughput, cycle time and velocity come from the real history of your issues, so a status update is one page.",
  },
];

export function UseCases() {
  return (
    <section aria-labelledby="landing-use-cases" className="mx-auto mt-20 w-full max-w-6xl px-4 sm:mt-28 sm:px-6">
      <SectionHeading id="landing-use-cases" title="What people use it for">
        A few ways the same pieces fit together.
      </SectionHeading>
      <ul className="mt-10 grid gap-4 md:grid-cols-2">
        {CASES.map((item) => (
          <li key={item.title} className="glass-card rounded-[var(--radius-card)] border-l-4 border-l-[var(--color-bg-action-create)] p-6 sm:p-7">
            <h3 className="text-lg font-semibold">{item.title}</h3>
            <p className="mt-2 text-[var(--color-text-muted)]">{item.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
