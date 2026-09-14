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
  healthy: "ปกติ",
  delayed: "ล่าช้า",
  "needs-attention": "ต้องตรวจสอบ",
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
        lastChecked: "เมื่อสักครู่",
        nextCheck: agency.schedule === "Every hour" ? "ใน 1 ชั่วโมง" : agency.schedule === "Every 6 hours" ? "ใน 6 ชั่วโมง" : "พรุ่งนี้ 08:00",
      } : agency));
      setCheckingId(null);
      setNotice("ตรวจสอบตัวอย่างเสร็จสิ้น ไม่มีการเชื่อมต่อเว็บไซต์จริง");
      recordEvent({ category: "Monitoring", action: "ตรวจสอบตัวอย่างเสร็จสิ้น", target: agencies.find((agency) => agency.id === id)?.name ?? "เว็บไซต์หน่วยงาน", details: "การตรวจสอบในเบราว์เซอร์เสร็จสิ้น โดยไม่เรียกเว็บไซต์ภายนอก" });
    }, 850);
  }

  function toggleAgency(id: string) {
    const agency = agencies.find((candidate) => candidate.id === id);
    if (agency) recordEvent({ category: "Monitoring", action: agency.enabled ? "Paused schedule" : "Resumed schedule", target: agency.name, details: `Agency monitoring was ${agency.enabled ? "paused" : "resumed"} from the frontend schedule screen.` });
    setAgencies((current) => current.map((agency) => agency.id === id ? {
      ...agency,
      enabled: !agency.enabled,
      nextCheck: agency.enabled ? "หยุดชั่วคราว" : "กำหนดเวลาแล้วหลังบันทึก",
    } : agency));
  }

  function updateSchedule(id: string, schedule: Agency["schedule"]) {
    const agency = agencies.find((candidate) => candidate.id === id);
    if (agency && agency.schedule !== schedule) recordEvent({ category: "Monitoring", action: "Updated schedule", target: `${agency.name}: ${agency.schedule} → ${schedule}`, details: "Agency monitor cadence was changed in the frontend prototype." });
    setAgencies((current) => current.map((agency) => agency.id === id ? { ...agency, schedule, nextCheck: "อัปเดตกำหนดการแล้ว" } : agency));
  }

  function addAgency(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const url = String(form.get("url") ?? "").trim();
    const schedule = String(form.get("schedule") ?? "Daily") as Agency["schedule"];
    if (!name || !url) return;
    setAgencies((current) => [...current, { id: `agency-${Date.now()}`, name, url, schedule, lastChecked: "ยังไม่ตรวจสอบ", nextCheck: "กำหนดเวลาแล้วหลังบันทึก", health: "healthy", enabled: true }]);
    recordEvent({ category: "Monitoring", action: "Added agency site", target: name, details: `Added ${url} with a ${schedule} schedule in the frontend prototype.` });
    setAddOpen(false);
    setNotice(`เพิ่ม ${name} ในกำหนดการติดตามบนเบราว์เซอร์แล้ว`);
  }

  return (
    <AccountShell allowedRoles={["admin"]}>
      <header className="account-header agency-monitor__header">
        <div><p className="login-kicker">การรวบรวมข้อมูลตามกำหนด</p><h1>ติดตามเว็บไซต์หน่วยงาน</h1><p>กำหนดรอบการตรวจสอบเว็บไซต์ของแต่ละหน่วยงาน การเปลี่ยนแปลงในตัวอย่างนี้เก็บไว้เฉพาะแท็บปัจจุบัน</p></div>
        <button className="button button--primary" type="button" onClick={() => setAddOpen(true)}><Plus size={16} /> เพิ่มเว็บไซต์หน่วยงาน</button>
      </header>

      {notice && <div className="role-management__notice" role="status">{notice}<button type="button" onClick={() => setNotice("")}>ปิด</button></div>}

      <section className="admin-monitor-summary" aria-label="สรุปการติดตาม">
        <article><Globe2 size={19} /><div><strong>{summary.enabled}</strong><span>เว็บไซต์ที่ตั้งเวลาตรวจสอบ</span></div></article>
        <article><Play size={19} /><div><strong>{summary.healthy}</strong><span>ตัวเชื่อมต่อปกติ</span></div></article>
        <article><Clock3 size={19} /><div><strong>{summary.attention}</strong><span>ต้องให้ผู้ดูแลตรวจสอบ</span></div></article>
      </section>

      <section className="agency-table-wrap role-management__card">
        <div className="admin-panel__title"><div><h2>เว็บไซต์หน่วยงานตามกำหนด</h2><p>กำหนดการแต่ละรายการจะสั่งตัวเชื่อมต่อเว็บไซต์และส่งประกาศใหม่เพื่อประมวลผลในอนาคต</p></div><span><Clock3 size={14} /> ตัวอย่างในเครื่อง</span></div>
        <div className="agency-table" role="table" aria-label="เว็บไซต์หน่วยงานตามกำหนด">
          <div className="agency-table__head" role="row"><span>เว็บไซต์หน่วยงาน</span><span>กำหนดการ</span><span>ตรวจสอบล่าสุด</span><span>ตรวจสอบครั้งถัดไป</span><span>สถานะ</span><span /></div>
          {agencies.map((agency) => (
            <div className="agency-table__row" role="row" key={agency.id}>
              <div><strong>{agency.name}</strong><span>{agency.url}</span></div>
              <select className="agency-schedule" value={agency.schedule} onChange={(event) => updateSchedule(agency.id, event.target.value as Agency["schedule"])} aria-label={`กำหนดการของ ${agency.name}`} disabled={!agency.enabled}><option value="Every hour">ทุก 1 ชั่วโมง</option><option value="Every 6 hours">ทุก 6 ชั่วโมง</option><option value="Daily">ทุกวัน</option></select>
              <span>{agency.lastChecked}</span><span>{agency.nextCheck}</span>
              <span className={`agency-health agency-health--${agency.health}`}>{agency.enabled ? healthCopy[agency.health] : "หยุดชั่วคราว"}</span>
              <div className="agency-actions"><button type="button" title="ตรวจสอบตัวอย่าง" aria-label={`ตรวจสอบตัวอย่างสำหรับ ${agency.name}`} onClick={() => runCheck(agency.id)} disabled={!agency.enabled || checkingId === agency.id}>{checkingId === agency.id ? <RefreshCw className="spin" size={14} /> : <RefreshCw size={14} />}</button><button type="button" title={agency.enabled ? "หยุดกำหนดการ" : "เริ่มกำหนดการ"} aria-label={agency.enabled ? `หยุด ${agency.name}` : `เริ่ม ${agency.name}`} onClick={() => toggleAgency(agency.id)}>{agency.enabled ? <Pause size={14} /> : <Play size={14} />}</button></div>
            </div>
          ))}
        </div>
      </section>

      {addOpen && <div className="invite-backdrop" role="presentation" onMouseDown={() => setAddOpen(false)}><form className="invite-dialog" onSubmit={addAgency} onMouseDown={(event) => event.stopPropagation()}><p className="login-kicker">แหล่งข้อมูลใหม่</p><h2>เพิ่มเว็บไซต์หน่วยงาน</h2><p>รายการนี้จะแสดงเฉพาะในหน้าเว็บตัวอย่าง</p><label><span>ชื่อหน่วยงาน</span><input name="name" autoFocus placeholder="เช่น สำนักงานเขตบางรัก" /></label><label><span>ที่อยู่เว็บไซต์</span><input name="url" placeholder="agency.example.go.th" /></label><label><span>กำหนดการตรวจสอบ</span><select name="schedule"><option value="Every hour">ทุก 1 ชั่วโมง</option><option value="Every 6 hours">ทุก 6 ชั่วโมง</option><option value="Daily">ทุกวัน</option></select></label><div><button className="button button--secondary" type="button" onClick={() => setAddOpen(false)}>ยกเลิก</button><button className="button button--primary" type="submit">เพิ่มกำหนดการ</button></div></form></div>}
    </AccountShell>
  );
}
