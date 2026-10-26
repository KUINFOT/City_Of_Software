import Link from "next/link";
import { BarChart3, Building2 } from "lucide-react";

const tabs = [
  { key: "budgets", href: "/analytics/budgets", label: "เปรียบเทียบงบประมาณ", icon: BarChart3 },
  { key: "agencies", href: "/analytics/agencies", label: "ความถี่รายหน่วยงาน", icon: Building2 },
] as const;

export function AnalyticsTabs({ active }: { active: (typeof tabs)[number]["key"] }) {
  return (
    <nav className="analytics-tabs" aria-label="หัวข้อการวิเคราะห์">
      {tabs.map(({ key, href, label, icon: Icon }) => (
        <Link key={key} href={href} className={key === active ? "active" : ""} aria-current={key === active ? "page" : undefined}>
          <Icon size={15} />{label}
        </Link>
      ))}
    </nav>
  );
}
