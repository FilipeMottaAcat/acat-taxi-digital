import { useState } from "react";
import { useAuth, useInvalidateAuth } from "../context/AuthContext";
import { ThemeToggle } from "./ThemeToggle";
import { logout } from "../lib/authApi";

interface AppHeaderProps {
  title: string;
}

export function AppHeader({ title }: AppHeaderProps) {
  const { user } = useAuth();
  const invalidateAuth = useInvalidateAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      await invalidateAuth();
      setLoggingOut(false);
    }
  }

  const whoLabel =
    user?.type === "admin"
      ? `${user.nome} · ${user.role === "admin_master" ? "master" : "comum"}`
      : user?.type === "driver"
        ? `Carro ${user.carNumber} · ${user.name}`
        : "";

  return (
    <header className="top">
      <div>
        <span className="eyebrow">ACAT · Despacho</span>
        <h1>{title}</h1>
      </div>
      <div className="who">
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
          <ThemeToggle />
        </div>
        <div>{whoLabel}</div>
        <button type="button" onClick={handleLogout} disabled={loggingOut}>
          {loggingOut ? "Saindo…" : "Sair"}
        </button>
      </div>
    </header>
  );
}
