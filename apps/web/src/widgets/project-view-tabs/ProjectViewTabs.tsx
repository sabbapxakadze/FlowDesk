import { Columns3, List } from "lucide-react";
import { projectPath } from "../../shared/lib/paths";
import { ViewTabs } from "../../shared/ui";

/**
 * The List / Board switch shown in the header of a project's Issues and Board pages (ADR 0034). They show the same issues, so
 * they read as two views of one thing; for now each is still its own page (and address), and the board has no filters, so
 * nothing is carried across. `panelOpen`: while the floating issue panel is open (480px at the right edge) the tabs keep clear of it on
 * a window narrower than 1560px, as the Issues filter row does, so they are never underneath it. (A widget may not import the
 * issue panel widget, so the page says whether it is open.)
 */
export function ProjectViewTabs({
  projectKey,
  panelOpen = false,
}: {
  projectKey: string;
  panelOpen?: boolean;
}) {
  return (
    <div data-tour="view-tabs" className={panelOpen ? "sm:max-[1559px]:pr-[31rem]" : undefined}>
      <ViewTabs
        label="View"
        items={[
          { to: projectPath(projectKey), label: "List", Icon: List, end: true },
          { to: projectPath(projectKey, "board"), label: "Board", Icon: Columns3 },
        ]}
      />
    </div>
  );
}
