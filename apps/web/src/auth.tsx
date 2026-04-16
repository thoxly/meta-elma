import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { setApiAuthState, setApiAuthStateChangedListener, type LoginResponse } from "./api";

type AuthState = LoginResponse | null;
type AuthContextValue = {
  auth: AuthState;
  setAuth: (next: AuthState) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_STORAGE_KEY = "meta-elma.auth";

function readInitialAuth(): AuthState {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LoginResponse;
  } catch {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

export function AuthProvider(props: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(() => readInitialAuth());

  useEffect(() => {
    setApiAuthState(auth);
    if (typeof window === "undefined") return;
    if (auth) {
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
    } else {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, [auth]);

  useEffect(() => {
    setApiAuthStateChangedListener((next: LoginResponse | null) => setAuth(next));
    return () => setApiAuthStateChangedListener(null);
  }, []);

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
