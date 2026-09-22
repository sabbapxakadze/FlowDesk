import { BrowserRouter, Routes, Route } from "react-router";
import { HomePage } from "../pages/home/HomePage";
import { ProjectsPage } from "../pages/projects/ProjectsPage";
import { RegisterPage } from "../pages/register/RegisterPage";
import { LoginPage } from "../pages/login/LoginPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </BrowserRouter>
  );
}
