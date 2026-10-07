import { Bell, ChartColumn, Columns3, MessageSquare, Search, ShieldCheck, Sparkles, Zap, type LucideIcon } from "lucide-react";
import { SectionHeading } from "./SectionHeading";

/** Only things the app really does today (each one is built and tested); no promises about what is coming. */
const TILES: { title: string; text: string; Icon: LucideIcon }[] = [
  {
    title: "Boards and sprints",
    text: "Drag work between columns, plan sprints from the backlog, and see what is in progress at a glance.",
    Icon: Columns3,
  },
  {
    title: "Live for everyone",
    text: "Comments, moves and who is viewing an issue update without a refresh.",
    Icon: Zap,
  },
  {
    title: "Analytics",
    text: "Throughput, cycle time and sprint velocity, worked out from each issue's real history.",
    Icon: ChartColumn,
  },
  {
    title: "Roles and history",
    text: "Owners, admins, members and viewers, invitations by email, and an audit log of who changed what.",
    Icon: ShieldCheck,
  },
  {
    title: "Find anything",
    text: "Search across your issues, jump anywhere with Ctrl+K, and filter by status, priority, label, assignee or due date.",
    Icon: Search,
  },
  {
    title: "Notifications",
    text: "Hear about the issues you are part of: comments, status changes and assignments reach you as they happen.",
    Icon: Bell,
  },
  {
    title: "Comments and files",
    text: "Comment with @mentions, attach images and videos and open them in a preview, edit or delete what you wrote.",
    Icon: MessageSquare,
  },
  {
    title: "Made for your day",
    text: "A My work page with your open issues, keyboard shortcuts, and light and dark themes that follow your system.",
    Icon: Sparkles,
  },
];

export function FeatureTiles() {
  return (
    <section aria-labelledby="landing-features" className="mx-auto mt-20 w-full max-w-6xl px-4 sm:mt-28 sm:px-6">
      <SectionHeading id="landing-features" title="What you get">
        Everything below is in the app today.
      </SectionHeading>
      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TILES.map(({ title, text, Icon }) => (
          <li key={title} className="glass-card rounded-[var(--radius-card)] p-6">
            <Icon size={26} aria-hidden="true" className="text-[var(--color-text-link)]" />
            <h3 className="mt-4 text-lg font-semibold">{title}</h3>
            <p className="mt-2 text-[var(--color-text-muted)]">{text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
