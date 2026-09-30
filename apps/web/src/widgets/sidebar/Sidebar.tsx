import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { Link, NavLink, useMatch } from "react-router";
import { useProjects } from "../../entities/project";
import { useAuth } from "../../shared/auth/useAuth";
import { useSearchPalette } from "../../shared/search-palette/useSearchPalette";
import { cn, Skeleton, ThemeSwitch } from "../../shared/ui";

const LINK =
  "flex items-center rounded-[var(--radius-control)] px-2.5 py-1.5 text-sm text-[var(--color-text-sidebar)] hover:bg-[var(--color-bg-sidebar-active)] hover:text-[var(--color-text-sidebar-active)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-text-sidebar-active)]";
const LINK_ACTIVE = "bg-[var(--color-bg-sidebar-active)] text-[var(--color-text-sidebar-active)]";

function SideLink({
  to,
  end = false,
  current,
  children,
}: {
  to: string;
  end?: boolean;
  /**
   * Set only when the URL alone can't say whether this link is "current":
   * the project's Issues link should also light up on an issue page, and
   * the project's own name should never claim the page when its sub-links
   * do. A plain <Link> is used then, so `aria-current` matches what is
   * highlighted (NavLink would derive it from the URL only).
   */
  current?: boolean;
  children: ReactNode;
}) {
  if (current !== undefined) {
    return (
      <Link to={to} aria-current={current ? "page" : undefined} className={cn(LINK, current && LINK_ACTIVE)}>
        {children}
      </Link>
    );
  }
  return (
    <NavLink to={to} end={end} className={({ isActive }) => cn(LINK, isActive && LINK_ACTIVE)}>
      {children}
    </NavLink>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 mb-1 px-2.5 text-xs font-medium tracking-wide text-[var(--color-text-sidebar)] uppercase opacity-70">
      {children}
    </p>
  );
}

/**
 * The app's persistent navigation. Every link points at a route that
 * already existed; this only makes them reachable from everywhere. The
 * project matching the current URL expands to its four pages (list, board,
 * sprints, analytics), which used to be reachable only through links inside
 * other pages. `actions` is a slot for the caller's buttons (the bell, or the
 * mobile drawer's close button): a widget may not import another widget, so
 * the shell in `app/` supplies it.
 */
export function Sidebar({ actions }: { actions?: ReactNode }) {
  const { user, organization, logout } = useAuth();
  const { data: projects, isPending, isError } = useProjects(organization?.id ?? "", {
    enabled: Boolean(organization),
  });
  const currentProject = useMatch("/projects/:projectId/*")?.params.projectId;
  const onIssuePage = useMatch("/projects/:projectId/issues/*") !== null;
  const { setOpen: setSearchOpen } = useSearchPalette();
  const onProjectList = useMatch({ path: "/projects/:projectId", end: true }) !== null;

  return (
    <div className="flex h-full flex-col gap-1 border-r border-[var(--color-border-sidebar)] bg-[var(--color-bg-sidebar)] p-3">
      <div className="flex items-center justify-between px-1 pb-3">
        <NavLink
          to="/projects"
          className="font-display text-2xl text-[var(--color-text-sidebar-active)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-text-sidebar-active)]"
        >
          FlowDesk
        </NavLink>
        {actions}
      </div>

      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        <SideLink to="/projects" end>
          Projects
        </SideLink>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className={cn(LINK, "w-full justify-between text-left")}
        >
          <span className="flex items-center gap-2">
            <Search aria-hidden className="h-4 w-4" />
            Search
          </span>
          <kbd className="text-xs opacity-70">Ctrl K</kbd>
        </button>

        <SectionLabel>Your projects</SectionLabel>
        {isPending ? (
          <div className="flex flex-col gap-1.5 px-2.5">
            <Skeleton className="h-4 w-full bg-[var(--color-bg-sidebar-active)]" />
            <Skeleton className="h-4 w-2/3 bg-[var(--color-bg-sidebar-active)]" />
          </div>
        ) : isError ? (
          <p className="px-2.5 text-sm text-[var(--color-text-sidebar)]">Could not load projects.</p>
        ) : projects.length === 0 ? (
          <p className="px-2.5 text-sm text-[var(--color-text-sidebar)]">No projects yet.</p>
        ) : (
          projects.map((project) => (
            <div key={project.id} className="flex flex-col gap-0.5">
              <SideLink to={`/projects/${project.id}`} current={false}>
                <span className="truncate">{project.name}</span>
              </SideLink>
              {project.id === currentProject && (
                <div className="ml-3 flex flex-col gap-0.5 border-l border-[var(--color-border-sidebar)] pl-2">
                  <SideLink to={`/projects/${project.id}`} current={onProjectList || onIssuePage}>
                    Issues
                  </SideLink>
                  <SideLink to={`/projects/${project.id}/board`}>Board</SideLink>
                  <SideLink to={`/projects/${project.id}/sprints`}>Sprints</SideLink>
                  <SideLink to={`/projects/${project.id}/analytics`}>Analytics</SideLink>
                </div>
              )}
            </div>
          ))
        )}
      </nav>

      <div className="mt-2 flex flex-col gap-0.5 border-t border-[var(--color-border-sidebar)] pt-3">
        <SideLink to="/design-system">Design system</SideLink>
        <div className="px-2.5 pt-2">
          <ThemeSwitch variant="sidebar" />
        </div>
        {user && (
          <div className="flex items-center justify-between gap-2 px-2.5 pt-2 text-sm">
            <span className="truncate text-[var(--color-text-sidebar-active)]">{user.name}</span>
            <button
              type="button"
              onClick={logout}
              className="shrink-0 text-[var(--color-text-sidebar)] underline hover:text-[var(--color-text-sidebar-active)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-text-sidebar-active)]"
            >
              Log out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
