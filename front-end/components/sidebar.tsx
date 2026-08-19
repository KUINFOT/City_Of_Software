"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Bookmark, Bot, CircleUserRound, Gauge, KeyRound } from "lucide-react";
import { Brand } from "./brand";

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
  return (
    <aside className="sidebar">
      <Brand inverse />
      <nav className="side-nav" aria-label="Account navigation">
        {items.map(({ label, href, icon: Icon }) => {
          const active = href === "/dashboard" ? pathname === "/dashboard" : href === "/settings" ? pathname === "/settings" : false;
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
