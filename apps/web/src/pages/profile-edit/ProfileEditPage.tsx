import { Link } from "react-router";
import { useProfile } from "../../entities/profile";
import { EditProfileForm } from "../../features/edit-profile";
import { useAuth } from "../../shared/auth/useAuth";
import { personPath } from "../../shared/lib/paths";
import { buttonVariants, Card, ErrorText, Page, PageHeader, Skeleton } from "../../shared/ui";

/** Edit your own profile (ADR 0028). Everyone in the organization sees what is saved here. */
export function ProfileEditPage() {
  const { organization, user } = useAuth();
  const profile = useProfile(organization!.id, user?.id ?? "", { enabled: Boolean(user) });

  return (
    <Page>
      <PageHeader title="Edit profile" back={{ to: user ? personPath(user.name, user.id) : "/projects", label: "Your profile", history: true }} />
      <Card className="max-w-xl p-5">
        {profile.isPending ? (
          <Skeleton className="h-48 w-full" />
        ) : profile.isError ? (
          <ErrorText>Could not load your profile: {profile.error.message}</ErrorText>
        ) : (
          <EditProfileForm profile={profile.data} />
        )}
      </Card>
      <p className="mt-4 text-sm">
        <Link to="/account" className={buttonVariants({ variant: "link" })}>
          Account settings: email, password, timezone
        </Link>
      </p>
      {profile.isSuccess && (
        <p className="mt-2 text-sm">
          <Link to={personPath(profile.data.name, profile.data.userId)} className={buttonVariants({ variant: "link" })}>
            See how others see it
          </Link>
        </p>
      )}
    </Page>
  );
}
