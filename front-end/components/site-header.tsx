import Link from "next/link";
import { Brand } from "./brand";

const links = ["Home", "Browse TORs", "AI Insights", "For Vendors", "BMA Agencies"];

export function SiteHeader({ active = "Home" }: { active?: string }) {
  return (
    <header className="site-header">
      <Brand />
      <nav className="top-nav" aria-label="Main navigation">
        {links.map((link) => (
          <Link
            key={link}
            href={link === "Home" ? "/" : link === "Browse TORs" ? "/dashboard" : `/#${link.toLowerCase().replaceAll(" ", "-")}`}
            className={active === link ? "active" : ""}
          >
            {link}
          </Link>
        ))}
      </nav>
      <div className="header-actions">
        <Link href="/dashboard" className="text-link">Sign In</Link>
        <Link href="/register" className="button button--primary button--small">Register Platform</Link>
      </div>
    </header>
  );
}
