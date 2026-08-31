"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { demoUsers, MockUser } from "@/data/mock-auth";

type StoredAccount = MockUser & { password: string };
type RegistrationInput = { name: string; email: string; password: string; organization: string; role: "vendor" | "reviewer" };

type AuthContextValue = {
  user: MockUser | null;
  ready: boolean;
  signInAs: (userId: string) => void;
  signIn: (email: string, password: string) => boolean;
  register: (input: RegistrationInput) => { ok: true } | { ok: false; message: string };
  signOut: () => void;
};

const STORAGE_KEY = "city-of-software-demo-user";
const ACCOUNTS_STORAGE_KEY = "city-of-software-local-accounts";
const seededAccounts: StoredAccount[] = demoUsers.map((user) => ({ ...user, password: "citysoft-demo" }));
const AuthContext = createContext<AuthContextValue | null>(null);

function isStoredAccount(value: unknown): value is StoredAccount {
  if (!value || typeof value !== "object") return false;
  const account = value as Partial<StoredAccount>;
  return typeof account.id === "string" && typeof account.name === "string" && typeof account.email === "string" && typeof account.organization === "string" && typeof account.password === "string" && (account.role === "vendor" || account.role === "reviewer" || account.role === "admin");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MockUser | null>(null);
  const [accounts, setAccounts] = useState<StoredAccount[]>(seededAccounts);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const savedUserId = window.localStorage.getItem(STORAGE_KEY);
    try {
      const parsed = JSON.parse(window.localStorage.getItem(ACCOUNTS_STORAGE_KEY) ?? "[]") as unknown;
      const localAccounts = Array.isArray(parsed) ? parsed.filter(isStoredAccount) : [];
      const availableAccounts = [...seededAccounts, ...localAccounts.filter((account) => !seededAccounts.some((seeded) => seeded.email === account.email))];
      setAccounts(availableAccounts);
      setUser(availableAccounts.find((candidate) => candidate.id === savedUserId) ?? null);
    } catch {
      setUser(seededAccounts.find((candidate) => candidate.id === savedUserId) ?? null);
    }
    setReady(true);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    ready,
    signInAs: (userId) => {
      const selectedUser = accounts.find((candidate) => candidate.id === userId) ?? null;
      setUser(selectedUser);
      if (selectedUser) window.localStorage.setItem(STORAGE_KEY, selectedUser.id);
    },
    signIn: (email, password) => {
      const selectedUser = accounts.find((candidate) => candidate.email.toLowerCase() === email.trim().toLowerCase() && candidate.password === password) ?? null;
      if (!selectedUser) return false;
      setUser(selectedUser);
      window.localStorage.setItem(STORAGE_KEY, selectedUser.id);
      return true;
    },
    register: (input) => {
      const email = input.email.trim().toLowerCase();
      if (accounts.some((candidate) => candidate.email.toLowerCase() === email)) return { ok: false, message: "An account with this email already exists. Please sign in instead." };
      const newAccount: StoredAccount = {
        id: `local-${Date.now()}`,
        name: input.name.trim(),
        email,
        password: input.password,
        organization: input.organization.trim(),
        role: input.role,
      };
      const updatedAccounts = [...accounts, newAccount];
      setAccounts(updatedAccounts);
      window.localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(updatedAccounts.filter((account) => !seededAccounts.some((seeded) => seeded.id === account.id))));
      window.localStorage.setItem(STORAGE_KEY, newAccount.id);
      setUser(newAccount);
      return { ok: true };
    },
    signOut: () => {
      window.localStorage.removeItem(STORAGE_KEY);
      setUser(null);
    },
  }), [accounts, ready, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
