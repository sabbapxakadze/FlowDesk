import { BrowserRouter, Routes, Route } from "react-router";
import { MyWorkPage } from "../pages/my-work/MyWorkPage";
import { AccountPage } from "../pages/account/AccountPage";
import { ConfirmEmailChangePage } from "../pages/confirm-email-change/ConfirmEmailChangePage";
import { ProjectsPage } from "../pages/projects/ProjectsPage";
import { ProjectDetailPage } from "../pages/project-detail/ProjectDetailPage";
import { ProjectBoardPage } from "../pages/project-board/ProjectBoardPage";
import { ProjectSprintsPage } from "../pages/project-sprints/ProjectSprintsPage";
import { IssueDetailPage } from "../pages/issue-detail/IssueDetailPage";
import { ProjectAnalyticsPage } from "../pages/project-analytics/ProjectAnalyticsPage";
import { SearchPage } from "../pages/search/SearchPage";
import { LabelsPage } from "../pages/labels/LabelsPage";
import { MembersPage } from "../pages/members/MembersPage";
import { AuditLogPage } from "../pages/audit-log/AuditLogPage";
import { ProfilePage } from "../pages/profile/ProfilePage";
import { ProfileEditPage } from "../pages/profile-edit/ProfileEditPage";
import { AcceptInvitePage } from "../pages/accept-invite/AcceptInvitePage";
import { ProjectSettingsPage } from "../pages/project-settings/ProjectSettingsPage";
import { ProjectRoute } from "../pages/project-route/ProjectRoute";
import { RegisterPage } from "../pages/register/RegisterPage";
import { LoginPage } from "../pages/login/LoginPage";
import { VerifyEmailPage } from "../pages/verify-email/VerifyEmailPage";
import { ForgotPasswordPage } from "../pages/forgot-password/ForgotPasswordPage";
import { ResetPasswordPage } from "../pages/reset-password/ResetPasswordPage";
import { DesignSystemPage } from "../pages/design-system/DesignSystemPage";
import { LandingPage } from "../pages/landing";
import { RequireAuth } from "../shared/auth/RequireAuth";
import { AppShell } from "./AppShell";
import { AuthLayout } from "./AuthLayout";
import { ErrorBoundary } from "../shared/error-boundary/ErrorBoundary";
import { IdleLogout } from "../features/idle-logout";
import { TourOverlay } from "../shared/tour";
import { CommandPalette } from "../widgets/command-palette";
import { SearchPaletteProvider } from "../shared/search-palette/SearchPaletteProvider";

export function App() {
  return (
    <BrowserRouter>
      <SearchPaletteProvider>
        <CommandPalette />
        <IdleLogout />
        <TourOverlay />
        <ErrorBoundary>
          <Routes>
            <Route
              element={
                <RequireAuth publicHome={<LandingPage />}>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route path="/" element={<MyWorkPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              {/* Every project page lives under the project's KEY (ADR 0030): ProjectRoute turns the key
                  (or an old id) into the project once and shows these pages only when it exists. */}
              <Route path="/projects/:projectKey" element={<ProjectRoute />}>
                <Route index element={<ProjectDetailPage />} />
                <Route path="board" element={<ProjectBoardPage />} />
                <Route path="sprints" element={<ProjectSprintsPage />} />
                <Route path="analytics" element={<ProjectAnalyticsPage />} />
                <Route path="settings" element={<ProjectSettingsPage />} />
                <Route path="issues/:issueKey" element={<IssueDetailPage />} />
              </Route>
              <Route path="/search" element={<SearchPage />} />
            <Route path="/labels" element={<LabelsPage />} />
            <Route path="/members" element={<MembersPage />} />
            <Route path="/audit-log" element={<AuditLogPage />} />
            <Route path="/people/:userId" element={<ProfilePage />} />
            <Route path="/profile" element={<ProfileEditPage />} />
            <Route path="/account" element={<AccountPage />} />
            </Route>
            <Route element={<AuthLayout />}>
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route path="/confirm-email-change" element={<ConfirmEmailChangePage />} />
              <Route path="/invite" element={<AcceptInvitePage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
            </Route>
            <Route path="/design-system" element={<DesignSystemPage />} />
          </Routes>
        </ErrorBoundary>
      </SearchPaletteProvider>
    </BrowserRouter>
  );
}
