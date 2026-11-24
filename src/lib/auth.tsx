"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, TOKEN_KEY } from "./api";

export interface User {
  id: string;
  username: string;
  isGuest: boolean;
}

interface AuthCtx {
  user: User | null;
  token: string | null;
  loading: boolean;
  login(username: string, password: string): Promise<void>;
  register(username: string, password: string): Promise<void>;
  guest(): Promise<void>;
  logout(): void;
  openAuth: boolean;
  setOpenAuth(v: boolean): void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openAuth, setOpenAuth] = useState(false);

  useEffect(() => {
    const t = window.localStorage.getItem(TOKEN_KEY);
    if (!t) {
      setLoading(false);
      return;
    }
    api<{ user: User | null }>("/api/auth/me")
      .then((r) => {
        if (r.user) {
          setUser(r.user);
          setToken(t);
        } else window.localStorage.removeItem(TOKEN_KEY);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const apply = useCallback((r: { user: User; token: string }) => {
    window.localStorage.setItem(TOKEN_KEY, r.token);
    setUser(r.user);
    setToken(r.token);
    setOpenAuth(false);
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      token,
      loading,
      openAuth,
      setOpenAuth,
      login: async (username, password) => apply(await api("/api/auth/login", { method: "POST", json: { username, password } })),
      register: async (username, password) =>
        apply(await api("/api/auth/register", { method: "POST", json: { username, password } })),
      guest: async () => apply(await api("/api/auth/guest", { method: "POST" })),
      logout: () => {
        window.localStorage.removeItem(TOKEN_KEY);
        setUser(null);
        setToken(null);
      },
    }),
    [user, token, loading, openAuth, apply],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
