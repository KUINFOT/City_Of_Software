"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, ChevronRight, Clock3, RadioTower, RefreshCw, ServerCrash } from "lucide-react";
import { AccountShell } from "@/components/account-shell";
import { useAdminAudit } from "@/components/admin-audit-provider";

type AdapterStatus = "Healthy" | "Delayed" | "Needs attention";

type Adapter = {
  id: string;
  agency: string;
  endpoint: string;
  status: AdapterStatus;
  lastSuccess: string;
  responseTime: string;
  nextCheck: string;
  processedToday: number;
  detail: string;
};

const adapters: Adapter[] = [
  { id: "sathon", agency: "Sathon District Office", endpoint: "webportal.bangkok.go.th/sathon", status: "Healthy", lastSuccess: "12 minutes ago", responseTime: "840 ms", nextCheck: "Today, 16:00", processedToday: 18, detail: "Last scheduled fetch completed successfully. No changes detected in the source index." },
  { id: "education", agency: "BMA Department of Education", endpoint: "bangkok.go.th/education", status: "Healthy", lastSuccess: "Today, 08:00", responseTime: "1.2 s", nextCheck: "Tomorrow, 08:00", processedToday: 6, detail: "The adapter completed its daily fetch and found two updated announcement pages." },
  { id: "planning", agency: "Department of City Planning", endpoint: "cpd.bangkok.go.th", status: "Delayed", lastSuccess: "2 hours ago", responseTime: "8.4 s", nextCheck: "In 8 minutes", processedToday: 3, detail: "The source responded slowly during the last run. The next scheduled attempt will retry automatically." },
  { id: "pathumwan", agency: "Pathum Wan District Office", endpoint: "webportal.bangkok.go.th/pathumwan", status: "Needs attention", lastSuccess: "Yesterday, 22:00", responseTime: "—", nextCheck: "Paused", processedToday: 0, detail: "The adapter is paused after the source layout changed. Review the selector configuration before enabling it again." },
];

const statusClass: Record<AdapterStatus, string> = { Healthy: "healthy", Delayed: "delayed", "Needs attention": "needs-attention" };

export default function AdapterHealthPage() {
  const [filter, setFilter] = useState<"All" | AdapterStatus>("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { recordEvent } = useAdminAudit();
  const visibleAdapters = useMemo(() => filter === "All" ? adapters : adapters.filter((adapter) => adapter.status === filter), [filter]);
  const selected = adapters.find((adapter) => adapter.id === selectedId);

  function refreshSnapshot() {
    setRefreshing(true);
    window.setTimeout(() => {
      setRefreshing(false);
      recordEvent({ category: "Adapter health", action: "Refreshed health snapshot", target: "All agency adapters", details: "A browser-only adapter status refresh was requested." });
    }, 700);
  }

  return (
    <AccountShell allowedRoles={["admin"]}>
      <header className="account-header adapter-health__header">
        <div><p className="login-kicker">ADAPTER OBSERVABILITY</p><h1>Agency Adapter Health</h1><p>See whether each configured agency adapter can collect its source site on schedule.</p></div>
        <button className="button button--secondary" type="button" onClick={refreshSnapshot} disabled={refreshing}><RefreshCw size={16} className={refreshing ? "spin" : ""} /> {refreshing ? "Refreshing…" : "Refresh snapshot"}</button>
      </header>

      <section className="adapter-summary" aria-label="Adapter health summary">
        <article><Activity size={20} /><div><strong>4</strong><span>Configured adapters</span></div></article>
        <article><CheckCircle2 size={20} /><div><strong>2</strong><span>Healthy and on schedule</span></div></article>
        <article><AlertTriangle size={20} /><div><strong>2</strong><span>Require attention</span></div></article>
      </section>

      <section className="adapter-health__panel">
        <div className="adapter-health__toolbar"><div><h2>Adapter status</h2><p>Data is a browser-only monitoring preview.</p></div><div className="adapter-filter" aria-label="Filter adapter status">{(["All", "Healthy", "Delayed", "Needs attention"] as const).map((status) => <button key={status} type="button" className={filter === status ? "active" : ""} onClick={() => setFilter(status)}>{status}</button>)}</div></div>
        <div className="adapter-list">
          {visibleAdapters.map((adapter) => <article key={adapter.id}>
            <div className={`adapter-status-dot adapter-status-dot--${statusClass[adapter.status]}`} />
            <div className="adapter-list__name"><strong>{adapter.agency}</strong><span>{adapter.endpoint}</span></div>
            <div><small>LAST SUCCESS</small><strong>{adapter.lastSuccess}</strong></div>
            <div><small>RESPONSE TIME</small><strong>{adapter.responseTime}</strong></div>
            <span className={`agency-health agency-health--${statusClass[adapter.status]}`}>{adapter.status}</span>
            <button type="button" onClick={() => { setSelectedId(adapter.id); recordEvent({ category: "Adapter health", action: "Viewed adapter detail", target: adapter.agency, details: "Administrator opened the adapter health detail panel." }); }}>View details <ChevronRight size={14} /></button>
          </article>)}
        </div>
      </section>

      <Link className="adapter-schedule-link" href="/admin/agency-monitor"><RadioTower size={16} /><span><strong>Need to change a cadence or pause an adapter?</strong><small>Open agency monitoring schedule</small></span><ChevronRight size={16} /></Link>

      {selected && <div className="invite-backdrop" role="presentation" onMouseDown={() => setSelectedId(null)}><section className="adapter-detail" role="dialog" aria-modal="true" aria-labelledby="adapter-detail-title" onMouseDown={(event) => event.stopPropagation()}><div className="adapter-detail__icon"><ServerCrash size={20} /></div><p className="login-kicker">ADAPTER CHECK DETAIL</p><h2 id="adapter-detail-title">{selected.agency}</h2><span className={`agency-health agency-health--${statusClass[selected.status]}`}>{selected.status}</span><p>{selected.detail}</p><dl><div><dt>Next check</dt><dd>{selected.nextCheck}</dd></div><div><dt>Items processed today</dt><dd>{selected.processedToday}</dd></div></dl><button className="button button--primary" type="button" onClick={() => setSelectedId(null)}>Close details</button></section></div>}
    </AccountShell>
  );
}
