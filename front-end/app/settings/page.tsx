"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AccountShell } from "@/components/account-shell";

const initialSearches = [
  { title: "CCTV surveillance & smart computer vision integrations", filter: "BMA Sathon & Pathum Wan Districts only" },
  { title: "LMS, school student information systems platforms", filter: "Any BMA Education Department" },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return <button type="button" className={`toggle ${checked ? "on" : ""}`} onClick={onChange} aria-pressed={checked}><span /></button>;
}

export default function SettingsPage() {
  const [toggles, setToggles] = useState([true, true, true]);
  const [searches, setSearches] = useState(initialSearches);
  const [saved, setSaved] = useState(false);
  const notificationLabels = [
    ["Daily Match Summary Digest", "Receive an email every morning listing newly extracted district TOR documents matching your stack."],
    ["Instant Urgent Alert (Deadlines < 10 days)", "Ping my notifications immediately when highly qualified matches have brief submission windows remaining."],
    ["BMA Compliance Revision Notices", "Notify me when a bookmarked district project undergoes revised technical specification draft releases."],
  ];

  return (
    <AccountShell>
      <header className="settings-header"><div><h1>Account Settings &amp; Preferences</h1><p>Manage your technology profile, district notifications, and verified credentials.</p></div><button className="button button--primary" onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 1800); }}>{saved ? "Changes Saved ✓" : "Save Profile Changes"}</button></header>
      <div className="settings-grid">
        <section className="profile-panel">
          <div className="profile-cover" />
          <div className="avatar avatar--large">AS</div>
          <h2>Anont Saengsirithan</h2><p>Principal Architect, Bangkok Innovations Ltd.</p><span className="verified">VERIFIED BMA SUPPLIER</span>
          <hr />
          <div className="org-details"><h3>ORGANIZATION DETAILS</h3><small>BMA Supplier Code</small><strong>TH-BKK-48220</strong><small>Headquarters</small><strong>Sathorn, Bangkok</strong><small>Company Phone</small><strong>+66 2 481 9284</strong><small>Verified Core Stacks</small><strong>Kubernetes, GIS Systems, AI, PHP</strong></div>
        </section>
        <div className="settings-main">
          <section className="settings-card" id="notifications">
            <h2>AI Aggregation &amp; Match Notifications</h2>
            {notificationLabels.map(([title, description], index) => (
              <div className="toggle-row" key={title}><Toggle checked={toggles[index]} onChange={() => setToggles((current) => current.map((value, i) => i === index ? !value : value))} /><div><strong>{title}</strong><p>{description}</p></div></div>
            ))}
          </section>
          <section className="settings-card">
            <div className="settings-card__title"><h2>Saved Smart Searches</h2><button onClick={() => setSearches((current) => [...current, { title: "New Bangkok smart city opportunity", filter: "All BMA districts" }])}><Plus size={15} /> Add New Search</button></div>
            {searches.map((search, index) => <div className="saved-search" key={`${search.title}-${index}`}><div><strong>{search.title}</strong><p>Filters: {search.filter}</p></div><button aria-label={`Delete ${search.title}`} onClick={() => setSearches((current) => current.filter((_, i) => i !== index))}><Trash2 size={17} /></button></div>)}
          </section>
          <section className="settings-card api-placeholder" id="api"><h2>Developer API Access</h2><p>API key management will be available after your supplier profile is approved.</p></section>
        </div>
      </div>
    </AccountShell>
  );
}
