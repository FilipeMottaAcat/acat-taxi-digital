import { Route, Routes } from "react-router-dom";
import { AppHeader } from "../../components/AppHeader";
import { BottomNav } from "../../components/BottomNav";
import { PushPrompt } from "../../components/PushPrompt";
import { useAuth } from "../../context/AuthContext";
import { ViagemPage } from "../shared/ViagemPage";
import { CidadePage } from "../shared/CidadePage";
import { PerfilPage } from "./PerfilPage";

export function DriverShell() {
  const { user } = useAuth();
  if (user?.type !== "driver") return null;

  const navItems = [
    { to: "/driver", label: "Viagem", end: true },
    { to: "/driver/cidade", label: "Cidade" },
    { to: "/driver/perfil", label: "Perfil" },
  ];

  return (
    <div id="app">
      <AppHeader title="ACAT Táxi Digital" />
      <main className="app-main">
        <PushPrompt />
        <Routes>
          <Route index element={<ViagemPage />} />
          <Route path="cidade" element={<CidadePage />} />
          <Route path="perfil" element={<PerfilPage />} />
          <Route path="*" element={<ViagemPage />} />
        </Routes>
      </main>
      <BottomNav items={navItems} />
    </div>
  );
}
