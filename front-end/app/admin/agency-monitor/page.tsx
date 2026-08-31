"use client";

import { FormEvent, useMemo, useState } from "react";
import { Clock3, Globe2, Pause, Play, Plus, RefreshCw } from "lucide-react";
import { AccountShell } from "@/components/account-shell";
import { useAdminAudit } from "@/components/admin-audit-provider";

type AgencyHealth = "healthy" | "delayed" | "needs-attention";

type Agency = {
  id: string;
  name: string;
  url: string;
  schedule: "Every hour" | "Every 6 hours" | "Daily";
  lastChecked: string;
  nextCheck: string;
  health: AgencyHealth;
  enabled: boolean;
};

const startingAgencies: Agency[] = [
  { id: "sathon", name: "Sathon District Office", url: "webportal.bangkok.go.th/sathon", schedule: "Every 6 hours", lastChecked: "12 minutes ago", nextCheck: "Today, 16:00", health: "healthy", enabled: true },
  { id: "education", name: "BMA Department of Education", url: "bangkok.go.th/education", schedule: "Daily", lastChecked: "Today, 08:00", nextCheck: "Tomorrow, 08:00", health: "healthy", enabled: true },
  { id: "planning", name: "Department of City Planning", url: "cpd.bangkok.go.th", schedule: "Every hour", lastChecked: "1 hour ago", nextCheck: "In 8 minutes", health: "delayed", enabled: true },
  { id: "pathumwan", name: "Pathum Wan District Office", url: "webportal.bangkok.go.th/pathumwan", schedule: "Every 6 hours", lastChecked: "Yesterday, 22:00", nextCheck: "Paused", health: "needs-attention", enabled: false },
];

const healthCopy: Record<AgencyHealth, string> = {
  healthy: "Healthy",
  delayed: "Delayed",
  "needs-attention": "Needs attention",
};

export default function AgencyMonitorPage() {
  const [agencies, setAgencies] = useState(startingAgencies);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const { recordEvent } = useAdminAudit();
  const summary = useMemo(() => ({
    enabled: agencies.filter((agency) => agency.enabled).length,
    healthy: agencies.filter((agency) => agency.health === "healthy").length,
    attention: agencies.filter((agency) => agency.health !== "healthy").length,
  }), [agencies]);

  function runCheck(id: string) {
    setCheckingId(id);
    window.setTimeout(() => {
      setAgencies((current) => current.map((agency) => agency.id === id ? {
        ...agency,
        health: "healthy",
        lastChecked: "Just now",
        nextCheck: agency.schedule === "Every hour" ? "In 1 hour" : agency.schedule === "Every 6 hours" ? "In 6 hours" : "Tomorrow, 08:00",
      } : agency));
      setCheckingId(null);
      setNotice("Demo check completed. No website was contacted.");
      recordEvent({ category: "Monitoring", action: "Completed demo check", target: agencies.find((agency) => agency.id === id)?.name ?? "Agency site", details: "A browser-only monitoring check completed. No external website was contacted." });
    }, 850);
  }

  function toggleAgency(id: string) {
    const agency = agencies.find((candidate) => candidate.id === id);
    if (agency) recordEvent({ category: "Monitoring", action: agency.enabled ? "Paused schedule" : "Resumed schedule", target: agency.name, details: `Agency monitoring was ${agency.enabled ? "paused" : "resumed"} from the frontend schedule screen.` });
    setAgencies((current) => current.map((agency) => agency.id === id ? {
      ...agency,
      enabled: !agency.enabled,
      nextCheck: agency.enabled ? "Paused" : "Scheduled after saving",
    } : agency));
  }

  function updateSchedule(id: string, schedule: Agency["schedule"]) {
    const agency = agencies.find((candidate) => candidate.id === id);
    if (agency && agency.schedule !== schedule) recordEvent({ category: "Monitoring", action: "Updated schedule", target: `${agency.name}: ${agency.schedule} → ${schedule}`, details: "Agency monitor cadence was changed in the frontend prototype." });
    setAgencies((current) => current.map((agency) => agency.id === id ? { ...agency, schedule, nextCheck: "Schedule updated" } : agency));
  }

  function addAgency(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const url = String(form.get("url") ?? "").trim();
    const schedule = String(form.get("schedule") ?? "Daily") as Agency["schedule"];
    if (!name || !url) return;
    setAgencies((current) => [...current, { id: `agency-${Date.now()}`, name, url, schedule, lastChecked: "Not checked yet", nextCheck: "Scheduled after saving", health: "healthy", enabled: true }]);
    recordEvent({ category: "Monitoring", action: "Added agency site", target: name, details: `Added ${url} with a ${schedule} schedule in the frontend prototype.` });
    setAddOpen(false);
    setNotice(`Added ${name} to the local monitoring schedule.`);
  }

  return (
    <AccountShell allowedRoles={["admin"]}>
      <header className="account-header agency-monitor__header">
        <div><p className="login-kicker">SCHEDULED COLLECTION</p><h1>Agency Site Monitoring</h1><p>Set the checking cadence for each agency site. This prototype stores changes only in the current browser tab.</p></div>
        <button className="button button--primary" type="button" onClick={() => setAddOpen(true)}><Plus size={16} /> Add agency site</button>
      </header>

      {notice && <div className="role-management__notice" role="status">{notice}<button type="button" onClick={() => setNotice("")}>Dismiss</button></div>}

      <section className="admin-monitor-summary" aria-label="Monitoring summary">
        <article><Globe2 size={19} /><div><strong>{summary.enabled}</strong><span>Sites currently scheduled</span></div></article>
        <article><Play size={19} /><div><strong>{summary.healthy}</strong><span>Adapters healthy</span></div></article>
        <article><Clock3 size={19} /><div><strong>{summary.attention}</strong><span>Need an administrator check</span></div></article>
      </section>

      <section className="agency-table-wrap role-management__card">
        <div className="admin-panel__title"><div><h2>Scheduled agency sites</h2><p>Each schedule will later trigger the site adapter and submit new postings for processing.</p></div><span><Clock3 size={14} /> Local preview</span></div>
        <div className="agency-table" role="table" aria-label="Scheduled agency sites">
          <div className="agency-table__head" role="row"><span>Agency site</span><span>Schedule</span><span>Last check</span><span>Next check</span><span>Health</span><span /></div>
          {agencies.map((agency) => (
            <div className="agency-table__row" role="row" key={agency.id}>
              <div><strong>{agency.name}</strong><span>{agency.url}</span></div>
              <select className="agency-schedule" value={agency.schedule} onChange={(event) => updateSchedule(agency.id, event.target.value as Agency["schedule"])} aria-label={`Schedule for ${agency.name}`} disabled={!agency.enabled}><option>Every hour</option><option>Every 6 hours</option><option>Daily</option></select>
              <span>{agency.lastChecked}</span><span>{agency.nextCheck}</span>
              <span className={`agency-health agency-health--${agency.health}`}>{agency.enabled ? healthCopy[agency.health] : "Paused"}</span>
              <div className="agency-actions"><button type="button" title="Run demo check" aria-label={`Run demo check for ${agency.name}`} onClick={() => runCheck(agency.id)} disabled={!agency.enabled || checkingId === agency.id}>{checkingId === agency.id ? <RefreshCw className="spin" size={14} /> : <RefreshCw size={14} />}</button><button type="button" title={agency.enabled ? "Pause schedule" : "Resume schedule"} aria-label={agency.enabled ? `Pause ${agency.name}` : `Resume ${agency.name}`} onClick={() => toggleAgency(agency.id)}>{agency.enabled ? <Pause size={14} /> : <Play size={14} />}</button></div>
            </div>
          ))}
        </div>
      </section>

      {addOpen && <div className="invite-backdrop" role="presentation" onMouseDown={() => setAddOpen(false)}><form className="invite-dialog" onSubmit={addAgency} onMouseDown={(event) => event.stopPropagation()}><p className="login-kicker">NEW SOURCE</p><h2>Add agency site</h2><p>This only adds an entry to the visible frontend list.</p><label><span>Agency name</span><input name="name" autoFocus placeholder="e.g. Bang Rak District Office" /></label><label><span>Website address</span><input name="url" placeholder="agency.example.go.th" /></label><label><span>Checking schedule</span><select name="schedule"><option>Every hour</option><option>Every 6 hours</option><option>Daily</option></select></label><div><button className="button button--secondary" type="button" onClick={() => setAddOpen(false)}>Cancel</button><button className="button button--primary" type="submit">Add schedule</button></div></form></div>}
    </AccountShell>
  );
}
