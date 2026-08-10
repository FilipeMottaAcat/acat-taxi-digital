import { Route, Routes } from "react-router-dom";
import { AppHeader } from "../../components/AppHeader";
import { BottomNav } from "../../components/BottomNav";
import { useAuth } from "../../context/AuthContext";
import { ViagemPage } from "../shared/ViagemPage";
import { CidadePage } from "../shared/CidadePage";
import { MotoristasPage } from "./MotoristasPage";
import { AdminsPage } from "./AdminsPage";
import { HistoricoPage } from "./HistoricoPage";

export function AdminShell() {
  const { user, isMaster } = useAuth();
  if (user?.type !== "admin") return null;

  const navItems = [
    { to: "/admin", label: "Viagem", end: true },
    { to: "/admin/cidade", label: "Cidade" },
    ...(isMaster ? [{ to: "/admin/motoristas", label: "Motoristas" }] : []),
    ...(isMaster ? [{ to: "/admin/admins", label: "Admins" }] : []),
    { to: "/admin/historico", label: "Histórico" },
  ];

  return (
    <div id="app">
      <AppHeader title="Painel Admin" />
      <main className="app-main">
        <Routes>
          <Route index element={<ViagemPage />} />
          <Route path="cidade" element={<CidadePage />} />
          {isMaster && <Route path="motoristas" element={<MotoristasPage />} />}
          {isMaster && <Route path="admins" element={<AdminsPage />} />}
          <Route path="historico" element={<HistoricoPage />} />
          <Route path="*" element={<ViagemPage />} />
        </Routes>
      </main>
      <BottomNav items={navItems} />
    </div>
  );
}
