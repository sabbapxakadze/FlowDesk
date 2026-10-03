import { BrowserRouter, Routes, Route } from "react-router";
import { HomeRedirect } from "../pages/home/HomeRedirect";
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
import { AcceptInvitePage } from "../pages/accept-invite/AcceptInvitePage";
import { ProjectSettingsPage } from "../pages/project-settings/ProjectSettingsPage";
import { RegisterPage } from "../pages/register/RegisterPage";
import { LoginPage } from "../pages/login/LoginPage";
import { VerifyEmailPage } from "../pages/verify-email/VerifyEmailPage";
import { ForgotPasswordPage } from "../pages/forgot-password/ForgotPasswordPage";
import { ResetPasswordPage } from "../pages/reset-password/ResetPasswordPage";
import { DesignSystemPage } from "../pages/design-system/DesignSystemPage";
import { RequireAuth } from "../shared/auth/RequireAuth";
import { AppShell } from "./AppShell";
import { AuthLayout } from "./AuthLayout";
import { ErrorBoundary } from "../shared/error-boundary/ErrorBoundary";
import { CommandPalette } from "../widgets/command-palette";
import { SearchPaletteProvider } from "../shared/search-palette/SearchPaletteProvider";

export function App() {
  return (
    <BrowserRouter>
      <SearchPaletteProvider>
        <CommandPalette />
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<HomeRedirect />} />
            <Route
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
              <Route path="/projects/:projectId/board" element={<ProjectBoardPage />} />
              <Route
                path="/projects/:projectId/sprints"
                element={<ProjectSprintsPage />}
              />
              <Route
                path="/projects/:projectId/analytics"
                element={<ProjectAnalyticsPage />}
              />
              <Route
                path="/projects/:projectId/issues/:issueId"
                element={<IssueDetailPage />}
              />
              <Route path="/search" element={<SearchPage />} />
            <Route path="/labels" element={<LabelsPage />} />
            <Route path="/members" element={<MembersPage />} />
            <Route path="/audit-log" element={<AuditLogPage />} />
            <Route path="/projects/:projectId/settings" element={<ProjectSettingsPage />} />
            </Route>
            <Route element={<AuthLayout />}>
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
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
