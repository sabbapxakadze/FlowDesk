import { BrowserRouter, Routes, Route } from "react-router";
import { HomePage } from "../pages/home/HomePage";
import { ProjectsPage } from "../pages/projects/ProjectsPage";
import { RegisterPage } from "../pages/register/RegisterPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Routes>
    </BrowserRouter>
  );
}
