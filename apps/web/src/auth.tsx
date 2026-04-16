import { createContext, useContext, useMemo, useState } from "react";
import type { LoginResponse } from "./api";

type AuthState = LoginResponse | null;
type AuthContextValue = {
  auth: AuthState;
  setAuth: (next: AuthState) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider(props: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(null);
  const value = useMemo(
    () => ({
      auth,
      setAuth,
      logout: () => setAuth(null)
    }),
    [auth]
  );
  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}
