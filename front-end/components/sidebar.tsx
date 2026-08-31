"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Bell, Bookmark, Bot, CircleUserRound, Gauge, HardDriveDownload, History, KeyRound, RadioTower, ShieldCheck } from "lucide-react";
import { Brand } from "./brand";
import { useAuth } from "./auth-provider";

const items = [
  { label: "Dashboard", href: "/dashboard", icon: Gauge },
  { label: "AI TOR Recommendations", href: "/dashboard#recommendations", icon: Bot },
  { label: "Bookmarked Projects", href: "/dashboard#bookmarks", icon: Bookmark },
  { label: "Alert Configuration", href: "/settings#notifications", icon: Bell },
  { label: "Account Profile", href: "/settings", icon: CircleUserRound },
  { label: "Developer API Keys", href: "/settings#api", icon: KeyRound },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const visibleItems = user?.role === "admin"
    ? [...items, { label: "Agency monitoring", href: "/admin/agency-monitor", icon: RadioTower }, { label: "Adapter health", href: "/admin/adapter-health", icon: Activity }, { label: "Account & Roles", href: "/admin/accounts", icon: ShieldCheck }, { label: "Audit trail", href: "/admin/audit-log", icon: History }, { label: "Export repository", href: "/admin/export-repository", icon: HardDriveDownload }]
    : items;

  return (
    <aside className="sidebar">
      <Brand inverse />
      <nav className="side-nav" aria-label="Account navigation">
        {visibleItems.map(({ label, href, icon: Icon }) => {
          const active = href === "/dashboard" ? pathname === "/dashboard" : href === "/settings" ? pathname === "/settings" : pathname === href;
          return <Link key={label} href={href} className={active ? "active" : ""}><Icon size={18} />{label}</Link>;
        })}
      </nav>
      <div className="system-status">
        <strong>SYSTEM STATUS</strong>
        <span><i /> AI Summary Pipeline Online</span>
      </div>
    </aside>
  );
}
