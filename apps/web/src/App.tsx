import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { getBootstrapStatus } from "./lib/authApi";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { useSocketConnection } from "./hooks/useSocket";
import { BootstrapPage } from "./pages/auth/BootstrapPage";
import { LoginPage } from "./pages/auth/LoginPage";
import { SignupPage } from "./pages/auth/SignupPage";
import { SetPasswordPage } from "./pages/auth/SetPasswordPage";
import { AdminShell } from "./pages/admin/AdminShell";
import { DriverShell } from "./pages/driver/DriverShell";

function LoadingScreen() {
  // The free-tier server can take ~30-50s to wake up from sleep — after a few seconds of loading,
  // reassure whoever's waiting that this is expected rather than looking frozen/broken.
  const [showColdStartHint, setShowColdStartHint] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setShowColdStartHint(true), 4000);
    return () => clearTimeout(id);
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        gap: 10,
        padding: 24,
        textAlign: "center",
      }}
    >
      <p className="subtle">Carregando…</p>
      {showColdStartHint && (
        <p className="subtle">O servidor pode estar acordando — isso pode levar até 1 minuto na primeira vez.</p>
      )}
    </div>
  );
}

function GuestOnly({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  if (user?.type === "admin") return <Navigate to="/admin" replace />;
  if (user?.type === "driver") return <Navigate to="/driver" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  if (user?.type !== "admin") return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireDriver({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  if (user?.type !== "driver") return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RootRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  if (user?.type === "admin") return <Navigate to="/admin" replace />;
  if (user?.type === "driver") return <Navigate to="/driver" replace />;
  return <Navigate to="/login" replace />;
}

function AuthedApp() {
  useSocketConnection();
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        }
      />
      <Route
        path="/signup"
        element={
          <GuestOnly>
            <SignupPage />
          </GuestOnly>
        }
      />
      <Route path="/set-password" element={<SetPasswordPage />} />
      <Route
        path="/admin/*"
        element={
          <RequireAdmin>
            <AdminShell />
          </RequireAdmin>
        }
      />
      <Route
        path="/driver/*"
        element={
          <RequireDriver>
            <DriverShell />
          </RequireDriver>
        }
      />
      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}

export default function App() {
  const { data, isLoading } = useQuery({
    queryKey: ["bootstrap-status"],
    queryFn: getBootstrapStatus,
  });

  if (isLoading) return <LoadingScreen />;
  if (data?.needsBootstrap) return <BootstrapPage />;

  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthedApp />
      </AuthProvider>
    </BrowserRouter>
  );
}
