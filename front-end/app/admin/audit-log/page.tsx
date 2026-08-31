"use client";

import { useMemo, useState } from "react";
import { CalendarClock, ChevronRight, ClipboardList, Filter, RadioTower, Search, ShieldCheck, UserCog } from "lucide-react";
import { AccountShell } from "@/components/account-shell";
import { AuditCategory, AuditEvent, useAdminAudit } from "@/components/admin-audit-provider";

const categoryIcon = { Accounts: UserCog, Monitoring: RadioTower, "Adapter health": ClipboardList, Repository: ClipboardList };

export default function AuditLogPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"All" | AuditCategory>("All");
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const { events } = useAdminAudit();
  const visibleEvents = useMemo(() => events.filter((event) => {
    const matchesCategory = category === "All" || event.category === category;
    const haystack = `${event.actor} ${event.action} ${event.target}`.toLowerCase();
    return matchesCategory && haystack.includes(query.toLowerCase().trim());
  }), [category, query]);

  return (
    <AccountShell allowedRoles={["admin"]}>
      <header className="account-header audit-log__header">
        <div><p className="login-kicker">ACCOUNTABILITY</p><h1>Audit Trail</h1><p>Review every important operational change across user access, schedules, and adapter monitoring.</p></div>
        <div className="audit-log__retention"><CalendarClock size={16} /><span><strong>90-day retention</strong><small>Backend archive will be connected later</small></span></div>
      </header>

      <section className="audit-log__panel">
        <div className="audit-log__toolbar"><label className="audit-log__search"><Search size={16} /><span className="sr-only">Search audit trail</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search actor, action, or target" /></label><label className="audit-log__filter"><Filter size={15} /><span className="sr-only">Filter by category</span><select value={category} onChange={(event) => setCategory(event.target.value as "All" | AuditCategory)}><option value="All">All activity</option><option value="Accounts">Accounts</option><option value="Monitoring">Monitoring</option><option value="Adapter health">Adapter health</option><option value="Repository">Repository</option></select></label></div>
        <div className="audit-log__count">{visibleEvents.length} event{visibleEvents.length === 1 ? "" : "s"} shown <span>•</span> Mock data for frontend testing</div>
        <div className="audit-event-list">
          {visibleEvents.map((event) => {
            const Icon = categoryIcon[event.category];
            return <article key={event.id}><span className={`audit-event__icon audit-event__icon--${event.category.toLowerCase().replaceAll(" ", "-")}`}><Icon size={16} /></span><div className="audit-event__body"><div><strong>{event.action}</strong><span>{event.category}</span></div><p>{event.target}</p><small>By {event.actor} · {event.time}</small></div><button type="button" onClick={() => setSelected(event)}>Details <ChevronRight size={14} /></button></article>;
          })}
          {!visibleEvents.length && <div className="audit-log__empty"><ClipboardList size={22} /><strong>No matching events</strong><p>Try changing the category or search phrase.</p></div>}
        </div>
      </section>

      {selected && <div className="invite-backdrop" role="presentation" onMouseDown={() => setSelected(null)}><section className="audit-detail" role="dialog" aria-modal="true" aria-labelledby="audit-detail-title" onMouseDown={(event) => event.stopPropagation()}><span className="audit-detail__icon"><ShieldCheck size={19} /></span><p className="login-kicker">AUDIT EVENT</p><h2 id="audit-detail-title">{selected.action}</h2><p>{selected.target}</p><dl><div><dt>Actor</dt><dd>{selected.actor}</dd></div><div><dt>When</dt><dd>{selected.time}</dd></div><div><dt>Category</dt><dd>{selected.category}</dd></div></dl><div className="audit-detail__description"><strong>Event note</strong><p>{selected.details}</p></div><button className="button button--primary" type="button" onClick={() => setSelected(null)}>Close event</button></section></div>}
    </AccountShell>
  );
}
