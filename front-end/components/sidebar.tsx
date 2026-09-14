"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Bell, Bookmark, Bot, CircleUserRound, Gauge, HardDriveDownload, History, KeyRound, RadioTower, ShieldCheck } from "lucide-react";
import { Brand } from "./brand";
import { useAuth } from "./auth-provider";

const items = [
  { label: "แดชบอร์ด", href: "/dashboard", icon: Gauge },
  { label: "TOR ที่ AI แนะนำ", href: "/dashboard#recommendations", icon: Bot },
  { label: "โครงการที่บันทึกไว้", href: "/dashboard#bookmarks", icon: Bookmark },
  { label: "ตั้งค่าการแจ้งเตือน", href: "/settings#notifications", icon: Bell },
  { label: "โปรไฟล์บัญชี", href: "/settings", icon: CircleUserRound },
  { label: "API Key สำหรับนักพัฒนา", href: "/settings#api", icon: KeyRound },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const visibleItems = user?.role === "admin"
    ? [...items, { label: "ติดตามหน่วยงาน", href: "/admin/agency-monitor", icon: RadioTower }, { label: "สถานะตัวเชื่อมต่อ", href: "/admin/adapter-health", icon: Activity }, { label: "บัญชีและบทบาท", href: "/admin/accounts", icon: ShieldCheck }, { label: "ประวัติการตรวจสอบ", href: "/admin/audit-log", icon: History }, { label: "ส่งออกข้อมูล", href: "/admin/export-repository", icon: HardDriveDownload }]
    : items;

  return (
    <aside className="sidebar">
      <Brand inverse />
      <nav className="side-nav" aria-label="เมนูบัญชีผู้ใช้">
        {visibleItems.map(({ label, href, icon: Icon }) => {
          const active = href === "/dashboard" ? pathname === "/dashboard" : href === "/settings" ? pathname === "/settings" : pathname === href;
          return <Link key={label} href={href} className={active ? "active" : ""}><Icon size={18} />{label}</Link>;
        })}
      </nav>
      <div className="system-status">
        <strong>สถานะระบบ</strong>
        <span><i /> ระบบสรุปผลด้วย AI พร้อมใช้งาน</span>
      </div>
    </aside>
  );
}
