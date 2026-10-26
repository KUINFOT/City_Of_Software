"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AccountShell } from "@/components/account-shell";
import { useAuth } from "@/components/auth-provider";
import { getVendorProfile, saveVendorProfile, ProfileCompleteness, VendorProfile } from "@/lib/vendor-profile";
import { Agency, getAgencies } from "@/lib/agencies-api";

const initialSearches = [
  { title: "CCTV surveillance & smart computer vision integrations", filter: "BMA Sathon & Pathum Wan Districts only" },
  { title: "LMS, school student information systems platforms", filter: "Any BMA Education Department" },
];

const emptyProfile: VendorProfile = { organizationType: "company", companyName: "", techStack: [], serviceCategories: [], certifications: [], pastContracts: [], notificationPrefs: { frequency: "instant" }, interests: { agencyIds: [], keywords: [] } };
type ProfileConfirmation = { kind: "save" } | { kind: "discard" } | { kind: "remove-contract"; index: number };
type SettingsTab = "account" | "seller" | "notifications";

const completenessLabels: Record<ProfileCompleteness["missingFields"][number]["key"], string> = {
  organizationType: "ประเภทองค์กร", companyName: "ชื่อบริษัท", techStack: "เทคโนโลยีที่ใช้", serviceCategories: "หมวดหมู่บริการ",
  yearsExperience: "ประสบการณ์", certifications: "ใบรับรอง", pastContracts: "ผลงานสัญญาที่ผ่านมา",
};

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return <button type="button" className={`toggle ${checked ? "on" : ""}`} onClick={onChange} aria-pressed={checked}><span /></button>;
}

function normalizeProfile(profile: VendorProfile): VendorProfile {
  const contracts = profile.pastContracts ?? [];
  // Preserve totals entered by older versions of the form by carrying them
  // forward as a self-declared contract when the old record had no details.
  const migratedContracts = !contracts.length && (profile.totalContractValueThb ?? 0) > 0
    ? [{ agencyName: "", projectTitle: "มูลค่าสัญญาที่แจ้งไว้เดิม", contractValueThb: profile.totalContractValueThb ?? 0 }]
    : contracts;
  return { ...emptyProfile, ...profile, certifications: profile.certifications ?? [], pastContracts: migratedContracts };
}

function profileChangeSignature(profile: VendorProfile): string {
  return JSON.stringify({
    organizationType: profile.organizationType,
    companyName: profile.companyName.trim(),
    techStack: profile.techStack,
    serviceCategories: profile.serviceCategories,
    yearsExperience: profile.yearsExperience ?? null,
    teamSize: profile.teamSize ?? null,
    certifications: profile.certifications,
    pastContracts: profile.pastContracts,
    // Auxiliary settings (backend keeps these OUTSIDE the versioned
    // capability snapshot — see vendorProfile.controller.ts) still need to
    // be part of THIS signature, or changing just one of them would never
    // register as an unsaved change and the save button would stay disabled.
    notificationFrequency: profile.notificationPrefs?.frequency ?? "instant",
    followedAgencyIds: profile.interests?.agencyIds ?? [],
    followedKeywords: profile.interests?.keywords ?? [],
  });
}

export default function SettingsPage() {
  const { user, token } = useAuth();
  const [toggles, setToggles] = useState([true, true, true]);
  const [searches, setSearches] = useState(initialSearches);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [savedProfileSnapshot, setSavedProfileSnapshot] = useState<VendorProfile>({ ...emptyProfile, companyName: user?.organization ?? "" });
  const [confirmation, setConfirmation] = useState<ProfileConfirmation | null>(null);
  const [profileError, setProfileError] = useState("");
  const [profile, setProfile] = useState<VendorProfile>({ ...emptyProfile, companyName: user?.organization ?? "" });
  const [completeness, setCompleteness] = useState<ProfileCompleteness | null>(null);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [activeTab, setActiveTab] = useState<SettingsTab>("account");

  useEffect(() => {
    if (!user?.id || !token || user.role !== "vendor") return;
    getVendorProfile(user.id, token)
      .then(({ profile: savedProfile, completeness: nextCompleteness }) => {
        setCompleteness(nextCompleteness);
        if (!savedProfile) return;
        const normalized = normalizeProfile(savedProfile);
        setProfile(normalized);
        setSavedProfileSnapshot(normalized);
      })
      .catch((error) => setProfileError(error instanceof Error ? error.message : "ไม่สามารถโหลดโปรไฟล์คุณสมบัติได้"));
  }, [token, user?.id, user?.role]);

  useEffect(() => { if (user?.role === "vendor") getAgencies().then(setAgencies).catch(() => setAgencies([])); }, [user?.role]);

  useEffect(() => {
    const setTabFromHash = () => {
      if (window.location.hash === "#notifications" || window.location.hash === "#api") setActiveTab("notifications");
      if (window.location.hash === "#profile" && user?.role === "vendor") setActiveTab("seller");
    };
    setTabFromHash();
    window.addEventListener("hashchange", setTabFromHash);
    return () => window.removeEventListener("hashchange", setTabFromHash);
  }, [user?.role]);

  function validateProfile(): string {
    if (profile.organizationType === "company" && !profile.companyName.trim()) return "โปรดระบุชื่อบริษัท";
    if (!profile.techStack.length && !profile.serviceCategories.length) return "โปรดเพิ่มเทคโนโลยีหรือหมวดหมู่บริการอย่างน้อย 1 รายการ";
    if (profile.yearsExperience !== undefined && (profile.yearsExperience < 0 || profile.yearsExperience > 100)) return "ประสบการณ์ต้องอยู่ระหว่าง 0–100 ปี";
    if (profile.teamSize !== undefined && profile.teamSize < 1) return "จำนวนสมาชิกทีมต้องไม่น้อยกว่า 1";
    if (profile.pastContracts.some((contract) => !contract.projectTitle.trim() || !Number.isFinite(contract.contractValueThb) || contract.contractValueThb < 0)) return "สัญญาที่ผ่านมาแต่ละรายการต้องมีชื่อโครงการและมูลค่าที่ถูกต้อง";
    return "";
  }

  function requestSave() {
    if (!user?.id || !token) {
      setProfileError("เซสชันเข้าสู่ระบบหมดอายุ โปรดออกจากระบบแล้วเข้าสู่ระบบใหม่");
      return;
    }
    if (user.role !== "vendor") {
      setProfileError("เฉพาะบัญชีผู้ขายเท่านั้นที่แก้ไขโปรไฟล์คุณสมบัติได้");
      return;
    }
    if (!hasUnsavedChanges) return;
    const validationError = validateProfile();
    if (validationError) { setProfileError(validationError); return; }
    setConfirmation({ kind: "save" });
  }

  async function saveProfile() {
    if (!user?.id || !token || user.role !== "vendor") return;
    setSaving(true); setSaved(false); setProfileError("");
    try {
      const { profile: savedProfile, completeness: nextCompleteness } = await saveVendorProfile(user.id, token, profile);
      if (!savedProfile) throw new Error("ไม่พบโปรไฟล์ที่บันทึกแล้ว");
      const normalized = normalizeProfile(savedProfile);
      setProfile(normalized);
      setSavedProfileSnapshot(normalized);
      setCompleteness(nextCompleteness);
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "ไม่สามารถบันทึกโปรไฟล์ได้");
    } finally { setSaving(false); }
  }

  function updateContract(index: number, changes: Partial<VendorProfile["pastContracts"][number]>) {
    setProfile((current) => ({ ...current, pastContracts: current.pastContracts.map((contract, currentIndex) => currentIndex === index ? { ...contract, ...changes } : contract) }));
  }

  function startEditing() {
    setSaved(false);
    setProfileError("");
    setActiveTab("seller");
    setEditing(true);
  }

  function confirmAction() {
    if (!confirmation) return;
    if (confirmation.kind === "save") {
      setConfirmation(null);
      void saveProfile();
      return;
    }
    if (confirmation.kind === "discard") {
      setProfile(savedProfileSnapshot);
      setEditing(false);
      setProfileError("");
    } else {
      setProfile((current) => ({ ...current, pastContracts: current.pastContracts.filter((_, index) => index !== confirmation.index) }));
    }
    setConfirmation(null);
  }

  const notificationLabels = [
    ["สรุปโครงการที่ตรงกันรายวัน", "รับอีเมลทุกเช้าพร้อมรายการ TOR ใหม่จากแต่ละเขตที่ตรงกับเทคโนโลยีของคุณ"],
    ["แจ้งเตือนเร่งด่วน (กำหนดส่งน้อยกว่า 10 วัน)", "แจ้งเตือนทันทีเมื่อโครงการที่เหมาะสมมีช่วงเวลาส่งข้อเสนอเหลือน้อย"],
    ["แจ้งเตือนการแก้ไขข้อกำหนดของ กทม.", "แจ้งเตือนเมื่อโครงการเขตที่คุณบันทึกไว้มีการปรับปรุงร่างข้อกำหนดทางเทคนิค"],
  ];
  const initials = user?.name.split(" ").map((part) => part[0]).slice(0, 2).join("") ?? "";
  const roleLabel = user?.role === "vendor" ? "ผู้ขายซอฟต์แวร์" : user?.role === "reviewer" ? "เจ้าหน้าที่กรุงเทพมหานคร" : "ผู้ดูแลระบบแพลตฟอร์ม";
  const hasUnsavedChanges = editing && profileChangeSignature(profile) !== profileChangeSignature(savedProfileSnapshot);

  return (
    <AccountShell>
      <header className="settings-header profile-workspace-header">
        <div><p className="settings-kicker">ACCOUNT MANAGEMENT</p><h1>บัญชีและโปรไฟล์ผู้ขาย</h1><p>จัดการข้อมูลบัญชี คุณสมบัติองค์กร และการแจ้งเตือนของคุณในที่เดียว</p></div>
        <div className="settings-save-action">{editing ? <div className="settings-edit-actions"><button className="button button--secondary" type="button" onClick={() => hasUnsavedChanges ? setConfirmation({ kind: "discard" }) : setEditing(false)} disabled={saving}>ยกเลิก</button><button className="button button--primary" type="button" onClick={requestSave} disabled={saving || !hasUnsavedChanges}>{saving ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}</button></div> : <button className="button button--primary" type="button" onClick={startEditing} disabled={user?.role !== "vendor"}>แก้ไขโปรไฟล์</button>}{editing && !hasUnsavedChanges && <p className="settings-save-hint">แก้ไขข้อมูลอย่างน้อย 1 รายการเพื่อบันทึกเวอร์ชันใหม่</p>}{saved && <p role="status">บันทึกโปรไฟล์เวอร์ชันใหม่แล้ว</p>}{profileError && <p className="register-error" role="alert">{profileError}</p>}</div>
      </header>

      <section className="profile-overview" aria-label="สรุปบัญชี">
        <div className="avatar avatar--large profile-overview__avatar">{initials}</div>
        <div className="profile-overview__identity"><small>เจ้าของบัญชี</small><strong>{user?.name ?? "บัญชีของคุณ"}</strong><span>{user?.email ?? "—"}</span><em>บัญชีใช้งานอยู่</em></div>
        <div className="profile-overview__organization"><small>องค์กร</small><strong>{(user?.organization ?? profile.companyName) || "—"}</strong><small>บทบาทบนแพลตฟอร์ม</small><span>{roleLabel}</span></div>
        {user?.role === "vendor" && <div className="profile-score"><small>โปรไฟล์ผู้ขาย</small><strong>{completeness?.score ?? 0}%</strong><i><span style={{ width: `${completeness?.score ?? 0}%` }} /></i></div>}
      </section>

      <nav className="profile-tabs" role="tablist" aria-label="หมวดการตั้งค่าบัญชี">
        <button type="button" role="tab" aria-selected={activeTab === "account"} className={activeTab === "account" ? "active" : ""} onClick={() => setActiveTab("account")}>ข้อมูลส่วนตัว</button>
        {user?.role === "vendor" && <button type="button" role="tab" aria-selected={activeTab === "seller"} className={activeTab === "seller" ? "active" : ""} onClick={() => setActiveTab("seller")}>โปรไฟล์ผู้ขาย</button>}
        <button type="button" role="tab" aria-selected={activeTab === "notifications"} className={activeTab === "notifications" ? "active" : ""} onClick={() => setActiveTab("notifications")}>การแจ้งเตือน</button>
      </nav>

      <section className="settings-card profile-tab-content" role="tabpanel">
        {activeTab === "account" && <>
          <div className="profile-tab-heading"><div><h2>ข้อมูลส่วนตัว</h2><p>ข้อมูลสำหรับระบุตัวตนและการเข้าสู่ระบบของบัญชีนี้</p></div><span>ACCOUNT OWNER</span></div>
          <div className="account-detail-grid">
            <div><small>ชื่อ-นามสกุล</small><strong>{user?.name ?? "—"}</strong></div><div><small>อีเมล</small><strong>{user?.email ?? "—"}</strong></div>
            <div><small>บทบาทบัญชี</small><strong>{roleLabel}</strong></div><div><small>องค์กร</small><strong>{(user?.organization ?? profile.companyName) || "—"}</strong></div>
          </div>
          <p className="profile-footnote">การตั้งค่ารหัสผ่านและความปลอดภัยจัดการได้จากระบบยืนยันตัวตนของบัญชี</p>
        </>}

        {activeTab === "seller" && user?.role === "vendor" && <>
          <div className="profile-tab-heading"><div><h2>คุณสมบัติผู้ขาย</h2><p>ข้อมูลที่ระบบใช้ประกอบการจับคู่ TOR และตรวจสอบคุณสมบัติ</p></div>{completeness && <span>โปรไฟล์ครบ {completeness.score}%</span>}</div>
          {!editing ? <div className="seller-summary">
            <article><h3>องค์กรและประสบการณ์</h3><dl><div><dt>ประเภทองค์กร</dt><dd>{profile.organizationType === "company" ? "บริษัท" : "ฟรีแลนซ์"}</dd></div><div><dt>ประสบการณ์</dt><dd>{profile.yearsExperience ?? "—"} ปี</dd></div><div><dt>ชื่อองค์กร</dt><dd>{profile.companyName || "—"}</dd></div></dl></article>
            <article><h3>ความสามารถทางเทคนิค</h3><small>เทคโนโลยี</small><div className="profile-tags">{profile.techStack.length ? profile.techStack.map((item) => <span key={item}>{item}</span>) : <em>ยังไม่ระบุ</em>}</div><small>บริการและใบรับรอง</small><div className="profile-tags">{[...profile.serviceCategories, ...profile.certifications.map((item) => item.name)].length ? [...profile.serviceCategories, ...profile.certifications.map((item) => item.name)].map((item) => <span key={item}>{item}</span>) : <em>ยังไม่ระบุ</em>}</div></article>
            <article className="seller-summary__contracts"><h3>ผลงานสัญญาที่ผ่านมา</h3><p>{profile.pastContracts.length ? `${profile.pastContracts.length} รายการ` : "ยังไม่มีข้อมูลผลงาน"}</p><strong>{new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(profile.pastContracts.reduce((total, contract) => total + (Number.isFinite(contract.contractValueThb) ? contract.contractValueThb : 0), 0))}</strong></article>
          </div> : <>
            <p className="profile-edit-state profile-edit-state--editing">กำลังแก้ไขอยู่ — ตรวจทานข้อมูล แล้วกดบันทึกเพื่อสร้างเวอร์ชันใหม่</p>
            <fieldset className="profile-editor" disabled={saving}>
              <div className="form-grid"><label className="form-field">ประเภทองค์กร<select value={profile.organizationType} onChange={(event) => setProfile((current) => ({ ...current, organizationType: event.target.value as "company" | "freelancer" }))}><option value="company">บริษัท</option><option value="freelancer">ฟรีแลนซ์</option></select></label>{profile.organizationType === "company" && <label className="form-field">ชื่อบริษัท<input value={profile.companyName} required onChange={(event) => setProfile((current) => ({ ...current, companyName: event.target.value }))} /></label>}<label className="form-field">ประสบการณ์ (ปี)<input type="number" min="0" max="100" value={profile.yearsExperience ?? ""} onChange={(event) => setProfile((current) => ({ ...current, yearsExperience: event.target.value ? Number(event.target.value) : undefined }))} /></label><label className="form-field">จำนวนสมาชิกทีม<input type="number" min="1" value={profile.teamSize ?? ""} onChange={(event) => setProfile((current) => ({ ...current, teamSize: event.target.value ? Number(event.target.value) : undefined }))} /></label></div>
              <label className="form-field">เทคโนโลยีที่ใช้ (คั่นด้วยจุลภาค)<input value={profile.techStack.join(", ")} onChange={(event) => setProfile((current) => ({ ...current, techStack: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} placeholder="React, Node.js, MongoDB" /></label>
              <label className="form-field">หมวดหมู่บริการ (คั่นด้วยจุลภาค)<input value={profile.serviceCategories.join(", ")} onChange={(event) => setProfile((current) => ({ ...current, serviceCategories: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} placeholder="เว็บแอปพลิเคชัน, วิเคราะห์ข้อมูล" /></label>
              <label className="form-field">ใบรับรอง (คั่นด้วยจุลภาค)<input value={profile.certifications.map((item) => item.name).join(", ")} onChange={(event) => setProfile((current) => ({ ...current, certifications: event.target.value.split(",").map((name) => name.trim()).filter(Boolean).map((name) => ({ name, issuer: "" })) }))} placeholder="ISO 27001, AWS Certified" /></label>
              <div className="settings-card__title"><div><h3>ผลงานสัญญาที่ผ่านมา</h3><p>มูลค่ารวมจะคำนวณจากรายการด้านล่าง</p></div><button type="button" onClick={() => setProfile((current) => ({ ...current, pastContracts: [...current.pastContracts, { agencyName: "", projectTitle: "", contractValueThb: 0 }] }))}><Plus size={15} /> เพิ่มผลงาน</button></div>
              {profile.pastContracts.map((contract, index) => <div className="form-grid" key={index}><label className="form-field">ชื่อโครงการ<input value={contract.projectTitle} onChange={(event) => updateContract(index, { projectTitle: event.target.value })} /></label><label className="form-field">หน่วยงาน<input value={contract.agencyName} onChange={(event) => updateContract(index, { agencyName: event.target.value })} /></label><label className="form-field">มูลค่า (บาท)<input type="number" min="0" value={contract.contractValueThb} onChange={(event) => updateContract(index, { contractValueThb: Number(event.target.value) })} /></label><label className="form-field">ปี<input type="number" min="1900" max="2100" value={contract.year ?? ""} onChange={(event) => updateContract(index, { year: event.target.value ? Number(event.target.value) : undefined })} /></label><button className="button button--secondary" type="button" onClick={() => setConfirmation({ kind: "remove-contract", index })}><Trash2 size={15} /> ลบรายการ</button></div>)}
            </fieldset>
          </>}
        </>}

        {activeTab === "notifications" && <>
          <div className="profile-tab-heading"><div><h2>การตั้งค่าการแจ้งเตือน</h2><p>เลือกวิธีรับข่าวสารเกี่ยวกับ TOR ที่เกี่ยวข้องและหน่วยงานที่ติดตาม</p></div><span>NOTIFICATIONS</span></div>
          {user?.role === "vendor" && <fieldset className="profile-editor notification-editor" disabled={!editing || saving}>
            <label className="form-field">ความถี่ในการแจ้งเตือน<select value={profile.notificationPrefs?.frequency ?? "instant"} onChange={(event) => setProfile((current) => ({ ...current, notificationPrefs: { frequency: event.target.value as "instant" | "daily_digest" } }))}><option value="instant">แจ้งเตือนทันทีทุกครั้งที่พบโครงการที่ตรงกัน</option><option value="daily_digest">สรุปรวมส่งวันละครั้ง</option></select></label>
            <div className="form-field"><span>หน่วยงานที่ติดตามเพิ่มเติม</span><div className="followed-agencies">{agencies.length === 0 ? <p>ยังไม่มีหน่วยงานให้เลือกติดตาม</p> : agencies.map((agency) => { const checked = profile.interests?.agencyIds.includes(agency._id) ?? false; return <label key={agency._id} className="followed-agency-option"><input type="checkbox" checked={checked} onChange={(event) => setProfile((current) => { const currentIds = current.interests?.agencyIds ?? []; const agencyIds = event.target.checked ? [...currentIds, agency._id] : currentIds.filter((id) => id !== agency._id); return { ...current, interests: { agencyIds, keywords: current.interests?.keywords ?? [] } }; })} />{agency.name}</label>; })}</div></div>
            <label className="form-field">คำสำคัญที่ติดตาม (คั่นด้วยจุลภาค)<input value={(profile.interests?.keywords ?? []).join(", ")} onChange={(event) => setProfile((current) => ({ ...current, interests: { agencyIds: current.interests?.agencyIds ?? [], keywords: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) } }))} placeholder="น้ำท่วม, CCTV, ระบบระบายน้ำ" /></label>
          </fieldset>}
          <div className="notification-switches">{notificationLabels.map(([title, description], index) => <div className="toggle-row" key={title}><Toggle checked={toggles[index]} onChange={() => setToggles((current) => current.map((value, i) => i === index ? !value : value))} /><div><strong>{title}</strong><p>{description}</p></div></div>)}</div>
          <div className="settings-card__title saved-searches-heading"><h3>การค้นหาที่บันทึกไว้</h3><button type="button" onClick={() => setSearches((current) => [...current, { title: "โครงการเมืองอัจฉริยะ", filter: "ทุกเขตในกรุงเทพมหานคร" }])}><Plus size={15} /> เพิ่มการค้นหา</button></div>{searches.map((search, index) => <div className="saved-search" key={`${search.title}-${index}`}><div><strong>{search.title}</strong><p>ตัวกรอง: {search.filter}</p></div><button aria-label={`ลบ ${search.title}`} onClick={() => setSearches((current) => current.filter((_, i) => i !== index))}><Trash2 size={17} /></button></div>)}
          <section className="api-placeholder" id="api"><h3>การเข้าถึง API สำหรับนักพัฒนา</h3><p>การจัดการ API Key จะพร้อมใช้งานหลังโปรไฟล์ผู้ขายของคุณได้รับอนุมัติ</p></section>
        </>}
      </section>
      {confirmation && <div className="invite-backdrop" role="presentation" onMouseDown={() => setConfirmation(null)}><section className="role-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-confirm-title" onMouseDown={(event) => event.stopPropagation()}><p className="login-kicker">ยืนยันการดำเนินการ</p><h2 id="profile-confirm-title">{confirmation.kind === "save" ? "บันทึกการแก้ไขโปรไฟล์?" : confirmation.kind === "discard" ? "ยกเลิกการแก้ไข?" : "ลบผลงานสัญญารายการนี้?"}</h2><p>{confirmation.kind === "save" ? "การบันทึกจะสร้างโปรไฟล์เวอร์ชันใหม่ และใช้กับการจับคู่ที่คำนวณหลังจากนี้เท่านั้น" : confirmation.kind === "discard" ? "ข้อมูลที่แก้ไขแต่ยังไม่ได้บันทึกจะหายไป" : "รายการนี้จะถูกลบออกจากแบบฟอร์ม และจะมีผลเมื่อคุณบันทึกการแก้ไข"}</p><div className="role-confirm-dialog__actions"><button className="button button--secondary" type="button" onClick={() => setConfirmation(null)}>กลับไปตรวจทาน</button><button className={confirmation.kind === "remove-contract" ? "button role-confirm-dialog__danger" : "button button--primary"} type="button" onClick={confirmAction}>{confirmation.kind === "save" ? "ยืนยันและบันทึก" : confirmation.kind === "discard" ? "ยืนยันการยกเลิก" : "ยืนยันการลบ"}</button></div></section></div>}
    </AccountShell>
  );
}
