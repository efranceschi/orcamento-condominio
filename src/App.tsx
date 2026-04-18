import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Sidebar } from "./components/layout/Sidebar";
import ScenariosPage from "./pages/ScenariosPage";
import ScenarioDetailsPage from "./pages/ScenarioDetailsPage";
import ScenarioSummaryPage from "./pages/ScenarioSummaryPage";
import AnalysisPage from "./pages/AnalysisPage";
import EditBudgetPage from "./pages/EditBudgetPage";
import CategoriesPage from "./pages/CategoriesPage";
import ParametersPage from "./pages/ParametersPage";
import BackupPage from "./pages/BackupPage";

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
          <Routes>
            <Route path="/" element={<ScenariosPage />} />
            <Route
              path="/scenarios/:id/details"
              element={<ScenarioDetailsPage />}
            />
            <Route
              path="/scenarios/:id/summary"
              element={<ScenarioSummaryPage />}
            />
            <Route path="/scenarios/:id/analysis" element={<AnalysisPage />} />
            <Route path="/scenarios/:id/edit" element={<EditBudgetPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/parameters" element={<ParametersPage />} />
            <Route path="/backup" element={<BackupPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
