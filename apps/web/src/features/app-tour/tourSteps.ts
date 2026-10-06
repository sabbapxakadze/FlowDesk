import type { TourStep } from "../../shared/tour";
import { projectPath } from "../../shared/lib/paths";

/**
 * What the Tutorial says (ADR 0040), in the order it says it. Each step points at a part of the page by its `data-tour` name; those names are
 * the contract with the components that carry them (search the code for `data-tour`). Steps about a project (creating an issue, the board)
 * go to the person's first project; with no project they are left out, and any step whose part is not on screen is skipped while the tour runs.
 */
export function buildTourSteps(projectKey: string | undefined): TourStep[] {
  const start: TourStep[] = [
    {
      id: "welcome",
      title: "Welcome to FlowDesk",
      body: "A two-minute tour of where things are. Use the buttons or the arrow keys, and press Esc whenever you want to stop. The tour never changes any of your data.",
    },
    {
      id: "projects",
      target: "sidebar-projects",
      placement: "right",
      title: "Your projects",
      body: "Every project of your team is here. Open one to see its Issues, Sprints, Analytics and Settings.",
    },
    {
      id: "search",
      target: "search",
      placement: "right",
      title: "Search everything",
      body: "Press Ctrl K (Cmd K on a Mac) from anywhere to find an issue by words from its title or description.",
    },
    {
      id: "my-work",
      target: "my-work",
      placement: "right",
      title: "My work",
      body: "The open issues assigned to you, from every project, and your unread notifications, on one page. This is your home.",
    },
  ];

  const project: TourStep[] = projectKey
    ? [
        {
          id: "new-issue",
          target: "new-issue",
          path: projectPath(projectKey),
          placement: "bottom",
          title: "Create an issue",
          body: "Click New issue, or just press C. Give it a title and, if you like, a description; it starts in Todo.",
        },
        {
          id: "filters",
          target: "issue-filters",
          path: projectPath(projectKey),
          placement: "bottom",
          title: "Find what matters",
          body: "Filter by status, priority, due date, person or label, and sort. The address remembers your filters, so you can share the link.",
        },
        {
          id: "view-tabs",
          target: "view-tabs",
          path: projectPath(projectKey),
          placement: "bottom",
          title: "List or Board",
          body: "The same issues in two views. The list is for scanning and filtering; the board is for moving work along.",
        },
        {
          id: "board",
          target: "board-columns",
          path: projectPath(projectKey, "board"),
          placement: "bottom",
          title: "Move work along",
          body: "Drag a card to another column to change its status, or up and down to reorder it. Each card also has a grip that works from the keyboard.",
        },
        {
          id: "issue",
          target: "issue-card",
          path: projectPath(projectKey, "board"),
          placement: "right",
          title: "Open an issue",
          body: "Click a card to open it beside the board: description, comments, files and activity. Type @ in a comment to mention a teammate.",
        },
        {
          id: "sprints",
          target: "sprints-link",
          path: projectPath(projectKey, "board"),
          placement: "right",
          title: "Plan with sprints",
          body: "Group issues into time-boxed sprints, start and complete them, and keep a backlog of what is next.",
        },
        {
          id: "analytics",
          target: "analytics-link",
          path: projectPath(projectKey, "board"),
          placement: "right",
          title: "See how you are doing",
          body: "Throughput, cycle time and sprint velocity, drawn from the history of your issues.",
        },
      ]
    : [];

  const finish: TourStep[] = [
    {
      id: "bell",
      target: "bell",
      placement: "right",
      title: "Notifications",
      body: "Comments, assignments and @mentions reach you here as they happen, and in My work.",
    },
    {
      id: "theme",
      target: "theme-switch",
      placement: "right",
      title: "Make it yours",
      body: "Choose light, dark or follow your system. Your timezone and password are on your account page, under your name.",
    },
    {
      id: "again",
      target: "tour-button",
      placement: "right",
      title: "That is the tour",
      body: "You can replay it any time from this button. Enjoy FlowDesk.",
    },
  ];

  return [...start, ...project, ...finish];
}
