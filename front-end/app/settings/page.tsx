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
  const [profile, setProfile] = useState<VendorProfile>({ organizationType: "company", companyName: user?.organization ?? "", techStack: [], serviceCategories: [], certifications: [], notificationPrefs: { frequency: "instant" } });
  useEffect(() => { if (user?.id && user.role === "vendor") getVendorProfile(user.id).then((savedProfile) => { if (savedProfile) setProfile({ notificationPrefs: { frequency: "instant" }, ...savedProfile }); }).catch(() => setProfileError("ไม่สามารถโหลดโปรไฟล์คุณสมบัติได้")); }, [user?.id, user?.role]);
  async function saveProfile() {
    if (!user?.id || user.role !== "vendor") return;
    setProfileError("");
    try { await saveVendorProfile(user.id, profile); setSaved(true); setTimeout(() => setSaved(false), 1800); } catch (error) { setProfileError(error instanceof Error ? error.message : "ไม่สามารถบันทึกโปรไฟล์ได้"); }
  }
  const notificationLabels = [
    ["สรุปโครงการที่ตรงกันรายวัน", "รับอีเมลทุกเช้าพร้อมรายการ TOR ใหม่จากแต่ละเขตที่ตรงกับเทคโนโลยีของคุณ"],
    ["แจ้งเตือนเร่งด่วน (กำหนดส่งน้อยกว่า 10 วัน)", "แจ้งเตือนทันทีเมื่อโครงการที่เหมาะสมมีช่วงเวลาส่งข้อเสนอเหลือน้อย"],
    ["แจ้งเตือนการแก้ไขข้อกำหนดของ กทม.", "แจ้งเตือนเมื่อโครงการเขตที่คุณบันทึกไว้มีการปรับปรุงร่างข้อกำหนดทางเทคนิค"],
  ];
  const initials = user?.name.split(" ").map((part) => part[0]).slice(0, 2).join("") ?? "";
  const roleLabel = user?.role === "vendor" ? "ผู้ขายซอฟต์แวร์" : user?.role === "reviewer" ? "เจ้าหน้าที่กรุงเทพมหานคร" : "ผู้ดูแลระบบแพลตฟอร์ม";

  return (
    <AccountShell>
      <header className="settings-header"><div><h1>ตั้งค่าบัญชีและความสนใจ</h1><p>จัดการโปรไฟล์เทคโนโลยี การแจ้งเตือนจากเขต และข้อมูลบัญชีของคุณ</p></div><button className="button button--primary" onClick={saveProfile}>{saved ? "บันทึกการเปลี่ยนแปลงแล้ว ✓" : "บันทึกโปรไฟล์"}</button></header>
      <div className="settings-grid">
        <section className="profile-panel">
          <div className="profile-cover" />
          <div className="avatar avatar--large">{initials}</div>
          <h2>{user?.name ?? "บัญชีของคุณ"}</h2><p>{roleLabel}, {user?.organization ?? "City of Software"}</p><span className="verified">{user?.role === "vendor" ? "โปรไฟล์ผู้ขาย" : "บัญชีแพลตฟอร์ม"}</span>
          <hr />
          <div className="org-details"><h3>รายละเอียดโปรไฟล์</h3><small>อีเมล</small><strong>{user?.email ?? "—"}</strong><small>องค์กร</small><strong>{user?.organization ?? "—"}</strong><small>บทบาทบนแพลตฟอร์ม</small><strong>{roleLabel}</strong><small>การยืนยันโปรไฟล์</small><strong>ข้อมูลตัวอย่าง · รอเชื่อมต่อ backend</strong></div>
        </section>
        <div className="settings-main">
          {user?.role === "vendor" && <section className="settings-card" id="profile"><h2>โปรไฟล์คุณสมบัติผู้ขาย</h2><p>ข้อมูลคุณสมบัติทั้งหมดเป็น <strong>ข้อมูลที่ผู้ใช้ระบุเอง</strong> และจะไม่แสดงว่าได้รับการยืนยัน</p><div className="form-grid"><label className="form-field">ประเภทองค์กร<select value={profile.organizationType} onChange={(event) => setProfile((current) => ({ ...current, organizationType: event.target.value as "company" | "freelancer" }))}><option value="company">บริษัท</option><option value="freelancer">ฟรีแลนซ์</option></select></label>{profile.organizationType === "company" && <label className="form-field">ชื่อบริษัท<input value={profile.companyName} onChange={(event) => setProfile((current) => ({ ...current, companyName: event.target.value }))} /></label>}<label className="form-field">ประสบการณ์ (ปี)<input type="number" min="0" value={profile.yearsExperience ?? ""} onChange={(event) => setProfile((current) => ({ ...current, yearsExperience: event.target.value ? Number(event.target.value) : undefined }))} /></label><label className="form-field">จำนวนสมาชิกทีม<input type="number" min="1" value={profile.teamSize ?? ""} onChange={(event) => setProfile((current) => ({ ...current, teamSize: event.target.value ? Number(event.target.value) : undefined }))} /></label><label className="form-field">มูลค่าสัญญาที่ผ่านมา (บาท)<input type="number" min="0" value={profile.totalContractValueThb ?? ""} onChange={(event) => setProfile((current) => ({ ...current, totalContractValueThb: event.target.value ? Number(event.target.value) : undefined }))} /></label></div><label className="form-field">เทคโนโลยีที่ใช้ (คั่นด้วยจุลภาค)<input value={profile.techStack.join(", ")} onChange={(event) => setProfile((current) => ({ ...current, techStack: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} placeholder="React, Node.js, MongoDB" /></label><label className="form-field">หมวดหมู่บริการ (คั่นด้วยจุลภาค)<input value={profile.serviceCategories.join(", ")} onChange={(event) => setProfile((current) => ({ ...current, serviceCategories: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} placeholder="เว็บแอปพลิเคชัน, วิเคราะห์ข้อมูล" /></label><label className="form-field">ใบรับรอง (คั่นด้วยจุลภาค)<input value={profile.certifications.map((item) => item.name).join(", ")} onChange={(event) => setProfile((current) => ({ ...current, certifications: event.target.value.split(",").map((name) => name.trim()).filter(Boolean).map((name) => ({ name, issuer: "" })) }))} placeholder="ISO 27001, AWS Certified" /></label>{profileError && <p className="register-error" role="alert">{profileError}</p>}</section>}
          <section className="settings-card" id="notifications">
            <h2>การประมวลผลและการแจ้งเตือนจาก AI</h2>
            {user?.role === "vendor" && (
              <div className="form-field" style={{ marginBottom: "1rem" }}>
                <label htmlFor="notification-frequency">ความถี่ในการแจ้งเตือนเมื่อพบโครงการที่ตรงกับคุณ</label>
                <select
                  id="notification-frequency"
                  value={profile.notificationPrefs?.frequency ?? "instant"}
                  onChange={(event) =>
                    setProfile((current) => ({ ...current, notificationPrefs: { frequency: event.target.value as "instant" | "daily_digest" } }))
                  }
                >
                  <option value="instant">แจ้งเตือนทันทีทุกครั้งที่พบโครงการที่ตรงกัน</option>
                  <option value="daily_digest">สรุปรวมส่งวันละครั้ง</option>
                </select>
              </div>
            )}
            {notificationLabels.map(([title, description], index) => (
              <div className="toggle-row" key={title}><Toggle checked={toggles[index]} onChange={() => setToggles((current) => current.map((value, i) => i === index ? !value : value))} /><div><strong>{title}</strong><p>{description}</p></div></div>
            ))}
          </section>
          <section className="settings-card">
            <div className="settings-card__title"><h2>Saved Smart Searches</h2><button onClick={() => setSearches((current) => [...current, { title: "New Bangkok smart city opportunity", filter: "All BMA districts" }])}><Plus size={15} /> Add New Search</button></div>
            {searches.map((search, index) => <div className="saved-search" key={`${search.title}-${index}`}><div><strong>{search.title}</strong><p>Filters: {search.filter}</p></div><button aria-label={`Delete ${search.title}`} onClick={() => setSearches((current) => current.filter((_, i) => i !== index))}><Trash2 size={17} /></button></div>)}
          </section>
          <section className="settings-card api-placeholder" id="api"><h2>การเข้าถึง API สำหรับนักพัฒนา</h2><p>การจัดการ API Key จะพร้อมใช้งานหลังโปรไฟล์ผู้ขายของคุณได้รับอนุมัติ</p></section>
        </div>
      </div>
    </AccountShell>
  );
}
