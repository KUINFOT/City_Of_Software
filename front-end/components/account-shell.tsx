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

  if (!ready || !user) return <main className="auth-loading">กำลังตรวจสอบเซสชัน…</main>;

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <main className="access-denied">
        <p className="login-kicker">ไม่มีสิทธิ์เข้าถึง</p>
        <h1>หน้านี้สำหรับผู้ดูแลระบบ</h1>
        <p>บทบาทปัจจุบันของคุณคือ <strong>{user.role}</strong> โปรดเข้าสู่ระบบด้วยบัญชีผู้ดูแลเพื่อจัดการผู้ใช้บนแพลตฟอร์ม</p>
        <Link className="button button--primary" href="/dashboard">กลับสู่แดชบอร์ด</Link>
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
