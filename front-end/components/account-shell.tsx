"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppRole } from "@/data/mock-auth";
import { useAuth } from "./auth-provider";
import { Sidebar } from "./sidebar";

type AccountShellProps = {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
};

export function AccountShell({ children, allowedRoles }: AccountShellProps) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (ready && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [pathname, ready, router, user]);

  if (!ready || !user) return <main className="auth-loading">Checking your session…</main>;

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <main className="access-denied">
        <p className="login-kicker">ACCESS RESTRICTED</p>
        <h1>This page is for administrators.</h1>
        <p>Your signed-in role is <strong>{user.role}</strong>. Switch to the administrator demo account to manage platform users.</p>
        <Link className="button button--primary" href="/dashboard">Return to dashboard</Link>
      </main>
    );
  }

  return (
    <main className="account-shell">
      <Sidebar />
      <div className="account-content">{children}</div>
    </main>
  );
}
