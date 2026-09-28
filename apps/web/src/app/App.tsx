import { BrowserRouter, Routes, Route } from "react-router";
import { HomePage } from "../pages/home/HomePage";
import { ProjectsPage } from "../pages/projects/ProjectsPage";
import { ProjectDetailPage } from "../pages/project-detail/ProjectDetailPage";
import { ProjectBoardPage } from "../pages/project-board/ProjectBoardPage";
import { ProjectSprintsPage } from "../pages/project-sprints/ProjectSprintsPage";
import { IssueDetailPage } from "../pages/issue-detail/IssueDetailPage";
import { SearchPage } from "../pages/search/SearchPage";
import { RegisterPage } from "../pages/register/RegisterPage";
import { LoginPage } from "../pages/login/LoginPage";
import { VerifyEmailPage } from "../pages/verify-email/VerifyEmailPage";
import { ForgotPasswordPage } from "../pages/forgot-password/ForgotPasswordPage";
import { ResetPasswordPage } from "../pages/reset-password/ResetPasswordPage";
import { DesignSystemPage } from "../pages/design-system/DesignSystemPage";
import { RequireAuth } from "../shared/auth/RequireAuth";
import { ErrorBoundary } from "../shared/error-boundary/ErrorBoundary";
import { CommandPalette } from "../widgets/command-palette";
import { NotificationBell } from "../widgets/notification-bell";

export function App() {
  return (
    <BrowserRouter>
      <CommandPalette />
      <NotificationBell />
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/projects"
            element={
              <RequireAuth>
                <ProjectsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/projects/:projectId"
            element={
              <RequireAuth>
                <ProjectDetailPage />
              </RequireAuth>
            }
          />
          <Route
            path="/projects/:projectId/board"
            element={
              <RequireAuth>
                <ProjectBoardPage />
              </RequireAuth>
            }
          />
          <Route
            path="/projects/:projectId/sprints"
            element={
              <RequireAuth>
                <ProjectSprintsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/projects/:projectId/issues/:issueId"
            element={
              <RequireAuth>
                <IssueDetailPage />
              </RequireAuth>
            }
          />
          <Route
            path="/search"
            element={
              <RequireAuth>
                <SearchPage />
              </RequireAuth>
            }
          />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/design-system" element={<DesignSystemPage />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
