"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AccountShell } from "@/components/account-shell";
import { useAuth } from "@/components/auth-provider";
import { getVendorProfile, saveVendorProfile, ProfileCompleteness, VendorProfile } from "@/lib/vendor-profile";

const initialSearches = [
  { title: "CCTV surveillance & smart computer vision integrations", filter: "BMA Sathon & Pathum Wan Districts only" },
  { title: "LMS, school student information systems platforms", filter: "Any BMA Education Department" },
];

const emptyProfile: VendorProfile = { organizationType: "company", companyName: "", techStack: [], serviceCategories: [], certifications: [], pastContracts: [] };
type ProfileConfirmation = { kind: "save" } | { kind: "discard" } | { kind: "remove-contract"; index: number };

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
      <header className="settings-header">
        <div><h1>ตั้งค่าบัญชีและความสนใจ</h1><p>จัดการโปรไฟล์เทคโนโลยี การแจ้งเตือนจากเขต และข้อมูลบัญชีของคุณ</p></div>
        <div className="settings-save-action">{editing ? <div className="settings-edit-actions"><button className="button button--secondary" type="button" onClick={() => hasUnsavedChanges ? setConfirmation({ kind: "discard" }) : setEditing(false)} disabled={saving}>ยกเลิก</button><button className="button button--primary" type="button" onClick={requestSave} disabled={saving || !hasUnsavedChanges}>{saving ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}</button></div> : <button className="button button--primary" type="button" onClick={startEditing} disabled={user?.role !== "vendor"}>แก้ไขโปรไฟล์</button>}{editing && !hasUnsavedChanges && <p className="settings-save-hint">แก้ไขข้อมูลอย่างน้อย 1 รายการเพื่อบันทึกเวอร์ชันใหม่</p>}{saved && <p role="status">บันทึกโปรไฟล์เวอร์ชันใหม่แล้ว</p>}{profileError && <p className="register-error" role="alert">{profileError}</p>}</div>
      </header>
      <div className="settings-grid">
        <section className="profile-panel">
          <div className="profile-cover" /><div className="avatar avatar--large">{initials}</div>
          <h2>{user?.name ?? "บัญชีของคุณ"}</h2><p>{roleLabel}, {user?.organization ?? "City of Software"}</p><span className="verified">{user?.role === "vendor" ? "โปรไฟล์ผู้ขาย" : "บัญชีแพลตฟอร์ม"}</span><hr />
          <div className="org-details"><h3>รายละเอียดโปรไฟล์</h3><small>อีเมล</small><strong>{user?.email ?? "—"}</strong><small>องค์กร</small><strong>{user?.organization ?? "—"}</strong><small>บทบาทบนแพลตฟอร์ม</small><strong>{roleLabel}</strong>{user?.role === "vendor" && <><small>เวอร์ชันความสามารถ</small><strong>v{profile.profileVersion ?? 1}</strong></>}</div>
        </section>
        <div className="settings-main">
          {user?.role === "vendor" && <section className="settings-card" id="profile">
            <h2>โปรไฟล์คุณสมบัติผู้ขาย</h2>
            <p>ข้อมูลทั้งหมดเป็น <strong>ข้อมูลที่ผู้ใช้ระบุเอง</strong> การบันทึกจะสร้างเวอร์ชันใหม่ และมีผลต่อการจับคู่ที่คำนวณหลังจากนั้นเท่านั้น</p>
            {completeness && <section className="profile-completeness" aria-label="ความครบถ้วนของโปรไฟล์">
              <div className="profile-completeness__header"><div><strong>โปรไฟล์ครบ {completeness.score}%</strong><p>ข้อมูลที่ครบช่วยให้ระบบจับคู่โครงการใหม่ได้แม่นยำขึ้น</p></div><span>{completeness.earnedWeight}/{completeness.totalWeight} คะแนน</span></div>
              <div className="profile-completeness__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completeness.score}><span style={{ width: `${completeness.score}%` }} /></div>
              {completeness.missingFields.length > 0 ? <div className="profile-completeness__missing"><strong>ข้อมูลที่ยังขาด</strong><ul>{completeness.missingFields.map((field) => <li key={field.key}>{completenessLabels[field.key]}</li>)}</ul></div> : <p className="profile-completeness__complete">โปรไฟล์ของคุณมีข้อมูลครบสำหรับการจับคู่แล้ว</p>}
            </section>}
            <p className={editing ? "profile-edit-state profile-edit-state--editing" : "profile-edit-state"}>{editing ? "กำลังแก้ไขอยู่ — ตรวจทานข้อมูล แล้วกดบันทึกเพื่อสร้างเวอร์ชันใหม่" : "โหมดอ่านอย่างเดียว — กด “แก้ไขโปรไฟล์” เมื่อต้องการเปลี่ยนข้อมูล"}</p>
            <fieldset className="profile-editor" disabled={!editing || saving}>
            <div className="form-grid">
              <label className="form-field">ประเภทองค์กร<select value={profile.organizationType} disabled={saving} onChange={(event) => setProfile((current) => ({ ...current, organizationType: event.target.value as "company" | "freelancer" }))}><option value="company">บริษัท</option><option value="freelancer">ฟรีแลนซ์</option></select></label>
              {profile.organizationType === "company" && <label className="form-field">ชื่อบริษัท<input value={profile.companyName} disabled={saving} required onChange={(event) => setProfile((current) => ({ ...current, companyName: event.target.value }))} /></label>}
              <label className="form-field">ประสบการณ์ (ปี)<input type="number" min="0" max="100" disabled={saving} value={profile.yearsExperience ?? ""} onChange={(event) => setProfile((current) => ({ ...current, yearsExperience: event.target.value ? Number(event.target.value) : undefined }))} /></label>
              <label className="form-field">จำนวนสมาชิกทีม<input type="number" min="1" disabled={saving} value={profile.teamSize ?? ""} onChange={(event) => setProfile((current) => ({ ...current, teamSize: event.target.value ? Number(event.target.value) : undefined }))} /></label>
            </div>
            <label className="form-field">เทคโนโลยีที่ใช้ (คั่นด้วยจุลภาค)<input value={profile.techStack.join(", ")} disabled={saving} onChange={(event) => setProfile((current) => ({ ...current, techStack: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} placeholder="React, Node.js, MongoDB" /></label>
            <label className="form-field">หมวดหมู่บริการ (คั่นด้วยจุลภาค)<input value={profile.serviceCategories.join(", ")} disabled={saving} onChange={(event) => setProfile((current) => ({ ...current, serviceCategories: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} placeholder="เว็บแอปพลิเคชัน, วิเคราะห์ข้อมูล" /></label>
            <label className="form-field">ใบรับรอง (คั่นด้วยจุลภาค)<input value={profile.certifications.map((item) => item.name).join(", ")} disabled={saving} onChange={(event) => setProfile((current) => ({ ...current, certifications: event.target.value.split(",").map((name) => name.trim()).filter(Boolean).map((name) => ({ name, issuer: "" })) }))} placeholder="ISO 27001, AWS Certified" /></label>
            <div className="settings-card__title"><div><h3>ผลงานสัญญาที่ผ่านมา</h3><p>มูลค่ารวมจะคำนวณจากรายการด้านล่าง</p></div><button type="button" disabled={saving} onClick={() => setProfile((current) => ({ ...current, pastContracts: [...current.pastContracts, { agencyName: "", projectTitle: "", contractValueThb: 0 }] }))}><Plus size={15} /> เพิ่มผลงาน</button></div>
            {profile.pastContracts.map((contract, index) => <div className="form-grid" key={index}>
              <label className="form-field">ชื่อโครงการ<input value={contract.projectTitle} disabled={saving} onChange={(event) => updateContract(index, { projectTitle: event.target.value })} /></label>
              <label className="form-field">หน่วยงาน<input value={contract.agencyName} disabled={saving} onChange={(event) => updateContract(index, { agencyName: event.target.value })} /></label>
              <label className="form-field">มูลค่า (บาท)<input type="number" min="0" value={contract.contractValueThb} disabled={saving} onChange={(event) => updateContract(index, { contractValueThb: Number(event.target.value) })} /></label>
              <label className="form-field">ปี<input type="number" min="1900" max="2100" value={contract.year ?? ""} disabled={saving} onChange={(event) => updateContract(index, { year: event.target.value ? Number(event.target.value) : undefined })} /></label>
              <button className="button button--secondary" type="button" disabled={saving} onClick={() => setConfirmation({ kind: "remove-contract", index })}><Trash2 size={15} /> ลบรายการ</button>
            </div>)}
            <p className="settings-card__summary">มูลค่าสัญญารวม: <strong>{new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(profile.pastContracts.reduce((total, contract) => total + (Number.isFinite(contract.contractValueThb) ? contract.contractValueThb : 0), 0))}</strong></p>
            </fieldset>
          </section>}
          <section className="settings-card" id="notifications"><h2>การประมวลผลและการแจ้งเตือนจาก AI</h2>{notificationLabels.map(([title, description], index) => <div className="toggle-row" key={title}><Toggle checked={toggles[index]} onChange={() => setToggles((current) => current.map((value, i) => i === index ? !value : value))} /><div><strong>{title}</strong><p>{description}</p></div></div>)}</section>
          <section className="settings-card"><div className="settings-card__title"><h2>Saved Smart Searches</h2><button onClick={() => setSearches((current) => [...current, { title: "New Bangkok smart city opportunity", filter: "All BMA districts" }])}><Plus size={15} /> Add New Search</button></div>{searches.map((search, index) => <div className="saved-search" key={`${search.title}-${index}`}><div><strong>{search.title}</strong><p>Filters: {search.filter}</p></div><button aria-label={`Delete ${search.title}`} onClick={() => setSearches((current) => current.filter((_, i) => i !== index))}><Trash2 size={17} /></button></div>)}</section>
          <section className="settings-card api-placeholder" id="api"><h2>การเข้าถึง API สำหรับนักพัฒนา</h2><p>การจัดการ API Key จะพร้อมใช้งานหลังโปรไฟล์ผู้ขายของคุณได้รับอนุมัติ</p></section>
        </div>
      </div>
      {confirmation && <div className="invite-backdrop" role="presentation" onMouseDown={() => setConfirmation(null)}><section className="role-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-confirm-title" onMouseDown={(event) => event.stopPropagation()}><p className="login-kicker">ยืนยันการดำเนินการ</p><h2 id="profile-confirm-title">{confirmation.kind === "save" ? "บันทึกการแก้ไขโปรไฟล์?" : confirmation.kind === "discard" ? "ยกเลิกการแก้ไข?" : "ลบผลงานสัญญารายการนี้?"}</h2><p>{confirmation.kind === "save" ? "การบันทึกจะสร้างโปรไฟล์เวอร์ชันใหม่ และใช้กับการจับคู่ที่คำนวณหลังจากนี้เท่านั้น" : confirmation.kind === "discard" ? "ข้อมูลที่แก้ไขแต่ยังไม่ได้บันทึกจะหายไป" : "รายการนี้จะถูกลบออกจากแบบฟอร์ม และจะมีผลเมื่อคุณบันทึกการแก้ไข"}</p><div className="role-confirm-dialog__actions"><button className="button button--secondary" type="button" onClick={() => setConfirmation(null)}>กลับไปตรวจทาน</button><button className={confirmation.kind === "remove-contract" ? "button role-confirm-dialog__danger" : "button button--primary"} type="button" onClick={confirmAction}>{confirmation.kind === "save" ? "ยืนยันและบันทึก" : confirmation.kind === "discard" ? "ยืนยันการยกเลิก" : "ยืนยันการลบ"}</button></div></section></div>}
    </AccountShell>
  );
}
