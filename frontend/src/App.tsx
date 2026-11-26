import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { AnalisesPage } from "./pages/AnalisesPage";
import { BillsPage } from "./pages/BillsPage";
import { BudgetsPage } from "./pages/BudgetsPage";
import { AjustesPage } from "./pages/AjustesPage";
import { HomePage } from "./pages/HomePage";
import { LancamentosPage } from "./pages/LancamentosPage";
import { LoginPage } from "./pages/LoginPage";
import { PessoalPage } from "./pages/PessoalPage";
import { DuplicadosPage } from "./pages/DuplicadosPage";
import { HistoricoPage } from "./pages/HistoricoPage";
import { MetasPage } from "./pages/MetasPage";
import { MaisPage } from "./pages/MaisPage";
import { SetupGate } from "./features/setup/SetupGate";
import { SetupPage } from "./features/setup/SetupPage";
import { AppShell } from "./shell/AppShell";

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/entrar" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<SetupGate />}>
            <Route path="/configuracao" element={<SetupPage />} />
            <Route element={<AppShell />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/lancamentos" element={<LancamentosPage />} />
              <Route path="/a-pagar" element={<BillsPage />} />
              <Route path="/orcamentos" element={<BudgetsPage />} />
              <Route path="/metas" element={<MetasPage />} />
              <Route path="/analises" element={<AnalisesPage />} />
              <Route path="/pessoal" element={<PessoalPage />} />
              <Route path="/duplicados" element={<DuplicadosPage />} />
              <Route path="/historico" element={<HistoricoPage />} />
              <Route path="/mais" element={<MaisPage />} />
              <Route path="/ajustes" element={<AjustesPage />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}
