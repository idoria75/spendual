import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { AjustesPage } from "./pages/AjustesPage";
import { HomePage } from "./pages/HomePage";
import { LancamentosPage } from "./pages/LancamentosPage";
import { LoginPage } from "./pages/LoginPage";
import { MaisPage } from "./pages/MaisPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
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
            <Route path="/a-pagar" element={<PlaceholderPage navKey="aPagar" />} />
            <Route path="/orcamentos" element={<PlaceholderPage navKey="orcamentos" />} />
            <Route path="/mais" element={<MaisPage />} />
            <Route path="/ajustes" element={<AjustesPage />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}
