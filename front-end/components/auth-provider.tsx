"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { AuthSession, AuthUser, login, RegistrationResponse, register } from "@/lib/auth-api";

type RegistrationInput = { name: string; email: string; password: string; organization: string; phone: string; role: "vendor" | "reviewer" };
type AuthResult = { ok: true; registration?: RegistrationResponse } | { ok: false; message: string };

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  register: (input: RegistrationInput) => Promise<AuthResult>;
  signOut: () => void;
};

const STORAGE_KEY = "city-of-software-user";
const AuthContext = createContext<AuthContextValue | null>(null);

function isAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<AuthSession>;
  const user = session.user as Partial<AuthUser> | undefined;
  return typeof session.token === "string" && !!user && typeof user.id === "string" && typeof user.name === "string" && typeof user.email === "string" && typeof user.organization === "string" && typeof user.phone === "string" && (user.role === "vendor" || user.role === "reviewer" || user.role === "admin") && (user.status === "active" || user.status === "suspended");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const storedSession = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as unknown;
      if (isAuthSession(storedSession)) {
        setUser(storedSession.user);
        setToken(storedSession.token);
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    setReady(true);
  }, []);

  const persistSession = (nextSession: AuthSession) => {
    setUser(nextSession.user);
    setToken(nextSession.token);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
  };

  const value = useMemo<AuthContextValue>(() => ({
    user,
    token,
    ready,
    signIn: async (email, password) => {
      try {
        persistSession(await login({ email, password }));
        return { ok: true };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "Unable to sign in." };
      }
    },
    register: async (input) => {
      try {
        return { ok: true, registration: await register(input) };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "Unable to create your account." };
      }
    },
    signOut: () => {
      window.localStorage.removeItem(STORAGE_KEY);
      setUser(null);
      setToken(null);
    },
  }), [ready, token, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
