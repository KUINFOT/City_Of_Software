"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AccountShell } from "@/components/account-shell";
import { useAuth } from "@/components/auth-provider";
import { getVendorProfile, saveVendorProfile, VendorProfile } from "@/lib/vendor-profile";

const initialSearches = [
  { title: "CCTV surveillance & smart computer vision integrations", filter: "BMA Sathon & Pathum Wan Districts only" },
  { title: "LMS, school student information systems platforms", filter: "Any BMA Education Department" },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return <button type="button" className={`toggle ${checked ? "on" : ""}`} onClick={onChange} aria-pressed={checked}><span /></button>;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [toggles, setToggles] = useState([true, true, true]);
  const [searches, setSearches] = useState(initialSearches);
  const [saved, setSaved] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profile, setProfile] = useState<VendorProfile>({ organizationType: "company", companyName: user?.organization ?? "", techStack: [], serviceCategories: [], certifications: [] });
  useEffect(() => { if (user?.id && user.role === "vendor") getVendorProfile(user.id).then((savedProfile) => { if (savedProfile) setProfile(savedProfile); }).catch(() => setProfileError("Unable to load your qualification profile.")); }, [user?.id, user?.role]);
  async function saveProfile() {
    if (!user?.id || user.role !== "vendor") return;
    setProfileError("");
    try { await saveVendorProfile(user.id, profile); setSaved(true); setTimeout(() => setSaved(false), 1800); } catch (error) { setProfileError(error instanceof Error ? error.message : "Unable to save your profile."); }
  }
  const notificationLabels = [
    ["Daily Match Summary Digest", "Receive an email every morning listing newly extracted district TOR documents matching your stack."],
    ["Instant Urgent Alert (Deadlines < 10 days)", "Ping my notifications immediately when highly qualified matches have brief submission windows remaining."],
    ["BMA Compliance Revision Notices", "Notify me when a bookmarked district project undergoes revised technical specification draft releases."],
  ];
  const initials = user?.name.split(" ").map((part) => part[0]).slice(0, 2).join("") ?? "";
  const roleLabel = user?.role === "vendor" ? "Software Vendor" : user?.role === "reviewer" ? "BMA Government Official" : "Platform Administrator";

  return (
    <AccountShell>
      <header className="settings-header"><div><h1>Account Settings &amp; Preferences</h1><p>Manage your technology profile, district notifications, and verified credentials.</p></div><button className="button button--primary" onClick={saveProfile}>{saved ? "Changes Saved ✓" : "Save Profile Changes"}</button></header>
      <div className="settings-grid">
        <section className="profile-panel">
          <div className="profile-cover" />
          <div className="avatar avatar--large">{initials}</div>
          <h2>{user?.name ?? "Your account"}</h2><p>{roleLabel}, {user?.organization ?? "City of Software"}</p><span className="verified">{user?.role === "vendor" ? "VENDOR PROFILE" : "PLATFORM ACCOUNT"}</span>
          <hr />
          <div className="org-details"><h3>PROFILE DETAILS</h3><small>Email address</small><strong>{user?.email ?? "—"}</strong><small>Organisation</small><strong>{user?.organization ?? "—"}</strong><small>Platform role</small><strong>{roleLabel}</strong><small>Profile verification</small><strong>Demo profile · Pending backend connection</strong></div>
        </section>
        <div className="settings-main">
          {user?.role === "vendor" && <section className="settings-card" id="profile"><h2>Vendor Qualification Profile</h2><p>All qualification information is <strong>self-declared</strong>; it is never presented as verified.</p><div className="form-grid"><label className="form-field">Organisation type<select value={profile.organizationType} onChange={(event) => setProfile((current) => ({ ...current, organizationType: event.target.value as "company" | "freelancer" }))}><option value="company">Company</option><option value="freelancer">Freelancer</option></select></label>{profile.organizationType === "company" && <label className="form-field">Company name<input value={profile.companyName} onChange={(event) => setProfile((current) => ({ ...current, companyName: event.target.value }))} /></label>}<label className="form-field">Years of experience<input type="number" min="0" value={profile.yearsExperience ?? ""} onChange={(event) => setProfile((current) => ({ ...current, yearsExperience: event.target.value ? Number(event.target.value) : undefined }))} /></label><label className="form-field">Team size<input type="number" min="1" value={profile.teamSize ?? ""} onChange={(event) => setProfile((current) => ({ ...current, teamSize: event.target.value ? Number(event.target.value) : undefined }))} /></label><label className="form-field">Past contract value (THB)<input type="number" min="0" value={profile.totalContractValueThb ?? ""} onChange={(event) => setProfile((current) => ({ ...current, totalContractValueThb: event.target.value ? Number(event.target.value) : undefined }))} /></label></div><label className="form-field">Technology stack (separate with commas)<input value={profile.techStack.join(", ")} onChange={(event) => setProfile((current) => ({ ...current, techStack: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} placeholder="React, Node.js, MongoDB" /></label><label className="form-field">Service categories (separate with commas)<input value={profile.serviceCategories.join(", ")} onChange={(event) => setProfile((current) => ({ ...current, serviceCategories: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} placeholder="Web application, Data analytics" /></label><label className="form-field">Certifications (separate with commas)<input value={profile.certifications.map((item) => item.name).join(", ")} onChange={(event) => setProfile((current) => ({ ...current, certifications: event.target.value.split(",").map((name) => name.trim()).filter(Boolean).map((name) => ({ name, issuer: "" })) }))} placeholder="ISO 27001, AWS Certified" /></label>{profileError && <p className="register-error" role="alert">{profileError}</p>}</section>}
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
