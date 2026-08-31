"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, ChevronDown, Gauge, HardDriveDownload, History, LogOut, RadioTower, Settings, ShieldCheck } from "lucide-react";
import { useAuth } from "./auth-provider";

export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  if (!user) return null;
  const initials = user.name.split(" ").map((part) => part[0]).slice(0, 2).join("");

  return (
    <div className="header-account" ref={menuRef}>
      <button type="button" className={compact ? "header-account__trigger header-account__trigger--compact" : "header-account__trigger"} aria-expanded={menuOpen} aria-haspopup="menu" onClick={() => setMenuOpen((open) => !open)}>
        <span className="header-account__avatar">{initials}</span>
        <span className="header-user"><strong>{user.name}</strong><small>{user.role}</small></span>
        <ChevronDown size={15} className={menuOpen ? "header-account__chevron open" : "header-account__chevron"} />
      </button>
      {menuOpen && <div className="header-account__menu" role="menu">
        <div className="header-account__summary"><strong>{user.name}</strong><span>{user.email}</span></div>
        <Link href="/dashboard" role="menuitem" onClick={() => setMenuOpen(false)}><Gauge size={15} /> Dashboard</Link>
        <Link href="/settings" role="menuitem" onClick={() => setMenuOpen(false)}><Settings size={15} /> Account settings</Link>
        {user.role === "admin" && <><span className="header-account__divider" /><Link href="/admin/agency-monitor" role="menuitem" onClick={() => setMenuOpen(false)}><RadioTower size={15} /> Agency monitoring</Link><Link href="/admin/adapter-health" role="menuitem" onClick={() => setMenuOpen(false)}><Activity size={15} /> Adapter health</Link><Link href="/admin/accounts" role="menuitem" onClick={() => setMenuOpen(false)}><ShieldCheck size={15} /> Account &amp; roles</Link><Link href="/admin/audit-log" role="menuitem" onClick={() => setMenuOpen(false)}><History size={15} /> Audit trail</Link><Link href="/admin/export-repository" role="menuitem" onClick={() => setMenuOpen(false)}><HardDriveDownload size={15} /> Export repository</Link></>}
        <span className="header-account__divider" />
        <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); signOut(); router.push("/"); }}><LogOut size={15} /> Sign out</button>
      </div>}
    </div>
  );
}
