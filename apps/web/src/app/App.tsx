import { BrowserRouter, Routes, Route } from "react-router";
import { HomePage } from "../pages/home/HomePage";
import { ProjectsPage } from "../pages/projects/ProjectsPage";
import { ProjectDetailPage } from "../pages/project-detail/ProjectDetailPage";
import { RegisterPage } from "../pages/register/RegisterPage";
import { LoginPage } from "../pages/login/LoginPage";
import { VerifyEmailPage } from "../pages/verify-email/VerifyEmailPage";
import { ForgotPasswordPage } from "../pages/forgot-password/ForgotPasswordPage";
import { ResetPasswordPage } from "../pages/reset-password/ResetPasswordPage";
import { RequireAuth } from "../shared/auth/RequireAuth";

export function App() {
  return (
    <BrowserRouter>
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
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Routes>
    </BrowserRouter>
  );
}
