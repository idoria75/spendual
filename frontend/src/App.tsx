import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { BillsPage } from "./pages/BillsPage";
import { BudgetsPage } from "./pages/BudgetsPage";
import { AjustesPage } from "./pages/AjustesPage";
import { HomePage } from "./pages/HomePage";
import { LancamentosPage } from "./pages/LancamentosPage";
import { LoginPage } from "./pages/LoginPage";
import { MaisPage } from "./pages/MaisPage";
import { AppShell } from "./shell/AppShell";

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/entrar" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/lancamentos" element={<LancamentosPage />} />
            <Route path="/a-pagar" element={<BillsPage />} />
            <Route path="/orcamentos" element={<BudgetsPage />} />
            <Route path="/mais" element={<MaisPage />} />
            <Route path="/ajustes" element={<AjustesPage />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}
