"use client";

import Link from "next/link";
import { Brand } from "./brand";
import { useAuth } from "./auth-provider";
import { AccountMenu } from "./account-menu";

const links = ["หน้าหลัก", "ค้นหา TOR", "ข้อมูลเชิงลึกจาก AI", "สำหรับผู้ขาย", "หน่วยงาน กทม."];

export function SiteHeader({ active = "หน้าหลัก" }: { active?: string }) {
  const { user, ready } = useAuth();
  return (
    <header className="site-header">
      <Brand />
      <nav className="top-nav" aria-label="เมนูหลัก">
        {links.map((link) => (
          <Link
            key={link}
            href={link === "หน้าหลัก" ? "/" : link === "ค้นหา TOR" ? "/browse-tors" : `/#${link}`}
            className={active === link ? "active" : ""}
          >
            {link}
          </Link>
        ))}
      </nav>
      <div className="header-actions">
        {ready && user ? <AccountMenu /> : <><Link href="/login" className="text-link">เข้าสู่ระบบ</Link><Link href="/register" className="button button--primary button--small">สมัครใช้งาน</Link></>}
      </div>
    </header>
  );
}
