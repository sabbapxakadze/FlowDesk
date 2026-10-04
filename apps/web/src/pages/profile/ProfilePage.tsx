import { Calendar, Mail } from "lucide-react";
import { Link, useParams } from "react-router";
import type { IssueEvent, Profile, ProfileActivityItem } from "@flowdesk/contracts";
import { describeEvent } from "../../entities/issue";
import { ROLE_LABELS } from "../../entities/member";
import { useProfile, useProfileActivity } from "../../entities/profile";
import { ApiError } from "../../shared/api/client";
import { useAuth } from "../../shared/auth/useAuth";
import {
  Avatar,
  Button,
  buttonVariants,
  Card,
  cn,
  EmptyState,
  ErrorText,
  Page,
  PageHeader,
  Skeleton,
  Time,
} from "../../shared/ui";
import { eventStyle } from "../../widgets/activity-line";

const MUTED = "text-[var(--color-text-muted)]";

function Facts({ profile }: { profile: Profile }) {
  return (
    <dl className="grid grid-cols-[20px_1fr] items-center gap-x-2 gap-y-2 text-sm">
      <Mail size={14} aria-hidden="true" className={MUTED} />
      <dd className="min-w-0 [overflow-wrap:anywhere]">{profile.email}</dd>
      <Calendar size={14} aria-hidden="true" className={MUTED} />
      <dd>
        Joined <Time iso={profile.joinedAt} />
      </dd>
    </dl>
  );
}

/**
 * One line of someone's activity: the icon for what they did, then the same sentence the
 * issue timeline uses ("changed priority to High") with the issue as a link. The sentence
 * says "this issue" where the timeline is already on the issue; here that phrase becomes the
 * link, and a sentence without it ("commented") gets "on <link>". The link opens the issue in
 * the side panel on its project page.
 */
function ActivityRow({ item, person }: { item: ProfileActivityItem; person: Profile }) {
  const event: IssueEvent = {
    id: item.id,
    issueId: item.issueId,
    actorId: person.userId,
    actorName: person.name,
    type: item.type,
    payload: item.payload,
    createdAt: item.createdAt,
  };
  const { Icon, color } = eventStyle(event);
  const sentence = describeEvent(event);
  const link = (
    <Link
      to={`/projects/${item.projectId}?issue=${item.issueId}`}
      className={buttonVariants({ variant: "link" })}
    >
      {item.issueKey} {item.issueTitle}
    </Link>
  );
  const [before, after] = sentence.split("this issue");
  const text =
    after === undefined ? (
      <>
        {sentence} on {link}
      </>
    ) : (
      <>
        {before}
        {link}
        {after}
      </>
    );

  return (
    <li className="flex items-center gap-3 text-sm">
      <span
        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-border-default)] ${color}`}
      >
        <Icon size={14} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{text}</span>
      <Time iso={item.createdAt} className={`shrink-0 whitespace-nowrap text-xs ${MUTED}`} />
    </li>
  );
}

function RecentActivity({ organizationId, profile }: { organizationId: string; profile: Profile }) {
  const activity = useProfileActivity(organizationId, profile.userId);
  const items = activity.data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold">Recent activity</h2>
      {activity.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : activity.isError ? (
        <ErrorText>Could not load activity: {activity.error.message}</ErrorText>
      ) : items.length === 0 ? (
        <EmptyState>No activity yet.</EmptyState>
      ) : (
        <>
          <ul aria-label="Recent activity" className="flex flex-col gap-3">
            {items.map((item) => (
              <ActivityRow key={item.id} item={item} person={profile} />
            ))}
          </ul>
          {activity.hasNextPage && (
            <div className="mt-4">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={activity.isFetchingNextPage}
                onClick={() => void activity.fetchNextPage()}
              >
                {activity.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/**
 * A person's profile (ADR 0028), the owner's design P2: an identity card at the left (photo,
 * name, title, role, email, joined) and, at the right, About and Recent activity. On a narrow
 * screen the identity card stacks above. Anyone in the organization can open it; someone who
 * is not in it is "not found".
 */
export function ProfilePage() {
  const { userId = "" } = useParams();
  const { organization, user } = useAuth();
  const organizationId = organization!.id;
  const profile = useProfile(organizationId, userId);
  const isMe = user?.id === userId;

  if (profile.isPending) {
    return (
      <Page>
        <Skeleton className="h-64 w-full" />
      </Page>
    );
  }
  if (profile.isError) {
    const notFound = profile.error instanceof ApiError && profile.error.status === 404;
    return (
      <Page>
        <PageHeader title={notFound ? "Person not found" : "Could not load this profile"} back={{ to: "/members", label: "Members", history: true }} />
        <p className={`text-sm ${MUTED}`}>
          {notFound
            ? "This person is not in your organization, or no longer is."
            : profile.error.message}
        </p>
      </Page>
    );
  }

  const person = profile.data;
  return (
    <Page>
      <PageHeader title={person.name} back={{ to: "/members", label: "Members", history: true }} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
        <Card className="flex flex-col items-center gap-3 p-5 text-center md:self-start">
          <Avatar name={person.name} src={person.avatarUrl} size="xl" />
          <div className="max-w-full">
            <p className="font-display text-xl leading-tight [overflow-wrap:anywhere]">{person.name}</p>
            {person.jobTitle && <p className={`text-sm ${MUTED} [overflow-wrap:anywhere]`}>{person.jobTitle}</p>}
          </div>
          <span className="rounded-full border border-[var(--color-border-default)] px-2 py-0.5 text-xs font-medium">
            {ROLE_LABELS[person.role]}
          </span>
          <div className="w-full border-t border-[var(--color-border-default)] pt-3 text-left">
            <Facts profile={person} />
          </div>
          {isMe && (
            <Link to="/profile" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-full text-center")}>
              Edit profile
            </Link>
          )}
        </Card>
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="p-5">
            <h2 className="mb-1 text-sm font-semibold">About</h2>
            {person.bio ? (
              <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{person.bio}</p>
            ) : (
              <p className={`text-sm ${MUTED}`}>
                {isMe ? "You have not written anything yet." : `${person.name} has not written anything yet.`}
              </p>
            )}
          </Card>
          <RecentActivity organizationId={organizationId} profile={person} />
        </div>
      </div>
    </Page>
  );
}
