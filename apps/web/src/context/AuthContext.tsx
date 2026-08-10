import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "../lib/api";
import type { CurrentUser } from "../types";

interface AuthContextValue {
  user: CurrentUser | null;
  isLoading: boolean;
  isAdmin: boolean;
  isMaster: boolean;
  isDriver: boolean;
  refetch: () => Promise<unknown>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<{ user: CurrentUser | null }>("/api/auth/me"),
  });

  const user = data?.user ?? null;

  const value: AuthContextValue = {
    user,
    isLoading,
    isAdmin: user?.type === "admin",
    isMaster: user?.type === "admin" && user.role === "admin_master",
    isDriver: user?.type === "driver",
    refetch,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** Call after login/signup/logout mutations to refresh the cached session everywhere. */
export function useInvalidateAuth() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["me"] });
}
