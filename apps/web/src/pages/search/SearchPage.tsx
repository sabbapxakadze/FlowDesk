import { useSearchParams } from "react-router";
import { useProjects } from "../../entities/project";
import { IssueCard, useSearch } from "../../entities/issue";
import { useAuth } from "../../shared/auth/useAuth";
import { Card, EmptyState, ErrorText, Input, Page, PageHeader, Skeleton } from "../../shared/ui";

function SearchResultsSkeleton() {
  return (
    <ul className="flex flex-col gap-2">
      {Array.from({ length: 3 }, (_, i) => (
        <Card key={i} as="li">
          <Skeleton className="mb-2 h-3 w-16" />
          <Skeleton className="mb-2 h-4 w-48" />
          <Skeleton className="h-3 w-20" />
        </Card>
      ))}
    </ul>
  );
}

/**
 * ?q= is the URL's source of truth, same convention ProjectDetailPage's
 * ?status=/?order= already established — a bookmarked or reloaded search
 * URL reproduces the same results with zero prior interaction, not just
 * component state. useSearch's own `enabled` guard (see useSearch.ts)
 * means an empty q never fires a request.
 *
 * Results can span multiple projects (this is an org-wide search, see the
 * Phase 7 slice 1 plan's "Decisions") — IssueCard needs a projectKey per
 * issue, resolved from the already-cached useProjects() list, same "no
 * dedicated single-project fetch" pattern every other page already uses.
 */
export function SearchPage() {
  const { organization } = useAuth();
  const { data: projects } = useProjects(organization!.id);
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";

  const { data: results, isPending, isError, error } = useSearch(organization!.id, q);

  function setQuery(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === "") {
        next.delete("q");
      } else {
        next.set("q", value);
      }
      return next;
    });
  }

  const trimmed = q.trim();

  return (
    <Page>
      <PageHeader title="Search" />

      <Input
        value={q}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search issues by title or description…"
        aria-label="Search issues"
        autoFocus
        className="mb-4"
      />

      {trimmed === "" ? (
        <EmptyState block>Type a search term to find issues across every project.</EmptyState>
      ) : isPending ? (
        <SearchResultsSkeleton />
      ) : isError ? (
        <ErrorText>Search failed: {error.message}</ErrorText>
      ) : results.length === 0 ? (
        <EmptyState block>No issues match "{trimmed}".</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {results.map((issue) => {
            const projectKey = projects?.find((p) => p.id === issue.projectId)?.key ?? "?";
            return <IssueCard key={issue.id} issue={issue} projectKey={projectKey} />;
          })}
        </ul>
      )}
    </Page>
  );
}
