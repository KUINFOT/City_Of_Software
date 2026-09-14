"use client";

import { useState } from "react";
import { CheckCircle2, Download, FileJson2, FileSpreadsheet, FolderArchive, HardDriveDownload, Info, ShieldCheck } from "lucide-react";
import { AccountShell } from "@/components/account-shell";
import { useAdminAudit } from "@/components/admin-audit-provider";

type ExportFormat = "json" | "csv";
type ExportRecord = { id: string; name: string; format: ExportFormat; scope: string; createdAt: string };

const repositoryPreview = [
  { recordType: "agency_schedule", name: "Sathon District Office", status: "active" },
  { recordType: "adapter_health", name: "Department of City Planning", status: "delayed" },
  { recordType: "audit_event", name: "Updated schedule", status: "recorded" },
];

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function ExportRepositoryPage() {
  const [format, setFormat] = useState<ExportFormat>("json");
  const [scope, setScope] = useState("การดำเนินงานและประวัติการตรวจสอบ");
  const [range, setRange] = useState("ข้อมูลตัวอย่างทั้งหมดที่มี");
  const [exports, setExports] = useState<ExportRecord[]>([]);
  const [notice, setNotice] = useState("");
  const { recordEvent } = useAdminAudit();

  function exportRepository() {
    const generatedAt = new Date().toISOString();
    const filename = `city-of-software-repository-${new Date().toISOString().slice(0, 10)}.${format}`;
    const content = format === "json"
      ? JSON.stringify({ generatedAt, scope, range, previewRecords: repositoryPreview, note: "ไฟล์ส่งออกตัวอย่างจากหน้าเว็บ ไม่รวมเอกสารต้นทางหรือข้อมูลจริง" }, null, 2)
      : ["record_type,name,status", ...repositoryPreview.map((record) => `${record.recordType},${record.name},${record.status}`)].join("\n");
    downloadFile(content, filename, format === "json" ? "application/json" : "text/csv");
    setExports((current) => [{ id: `${Date.now()}`, name: filename, format, scope, createdAt: "เมื่อสักครู่" }, ...current]);
    setNotice("สร้างและดาวน์โหลดไฟล์ตัวอย่างลงในเบราว์เซอร์แล้ว");
    recordEvent({ category: "Repository", action: "ส่งออกข้อมูล", target: filename, details: `สร้างไฟล์ ${format.toUpperCase()} ตัวอย่างสำหรับ ${scope}` });
  }

  return (
    <AccountShell allowedRoles={["admin"]}>
      <header className="account-header export-repository__header"><div><p className="login-kicker">การส่งออกข้อมูล</p><h1>ส่งออกคลังข้อมูล</h1><p>สร้างสำเนาการตั้งค่าการดำเนินงานและประวัติการตรวจสอบ โดยเอกสาร TOR ต้นทางอยู่นอกขอบเขตของหน้าเว็บตัวอย่างนี้</p></div><span className="export-repository__secure"><ShieldCheck size={16} /> ส่งออกได้เฉพาะผู้ดูแล</span></header>

      {notice && <div className="role-management__notice" role="status">{notice}<button type="button" onClick={() => setNotice("")}>ปิด</button></div>}

      <div className="export-repository__layout">
        <section className="export-repository__card">
          <div className="export-repository__title"><FolderArchive size={19} /><div><h2>เตรียมส่งออกข้อมูล</h2><p>เลือกรูปแบบไฟล์ตัวอย่างที่สร้างจากเบราว์เซอร์</p></div></div>
          <label className="export-field"><span>ขอบเขตข้อมูล</span><select value={scope} onChange={(event) => setScope(event.target.value)}><option>การดำเนินงานและประวัติการตรวจสอบ</option><option>การตั้งค่ากำหนดการหน่วยงาน</option><option>การตั้งค่าสิทธิ์เข้าถึงบัญชี</option></select></label>
          <label className="export-field"><span>ช่วงข้อมูล</span><select value={range} onChange={(event) => setRange(event.target.value)}><option>ข้อมูลตัวอย่างทั้งหมดที่มี</option><option>ภาพรวมการดำเนินงานล่าสุด</option><option>เฉพาะกิจกรรมตรวจสอบล่าสุด</option></select></label>
          <fieldset className="export-format"><legend>รูปแบบไฟล์</legend><label className={format === "json" ? "selected" : ""}><input type="radio" name="format" value="json" checked={format === "json"} onChange={() => setFormat("json")} /><FileJson2 size={19} /><span><strong>ไฟล์ JSON</strong><small>เมทาดาทาแบบมีโครงสร้างสำหรับย้ายระบบ</small></span></label><label className={format === "csv" ? "selected" : ""}><input type="radio" name="format" value="csv" checked={format === "csv"} onChange={() => setFormat("csv")} /><FileSpreadsheet size={19} /><span><strong>ตาราง CSV</strong><small>ข้อมูลสรุปแบบตารางสำหรับสเปรดชีต</small></span></label></fieldset>
          <button className="button button--primary export-repository__submit" type="button" onClick={exportRepository}><Download size={16} /> สร้างและดาวน์โหลด {format.toUpperCase()}</button>
        </section>

        <aside className="export-repository__preview"><Info size={18} /><h2>ข้อมูลในตัวอย่างนี้</h2><ul><li>การตั้งค่าติดตามหน่วยงาน</li><li>ภาพรวมสถานะตัวเชื่อมต่อ</li><li>เหตุการณ์ตรวจสอบของผู้ดูแล</li></ul><p>ไฟล์ดาวน์โหลดมีข้อมูลตัวอย่าง 3 รายการ เพื่อทดสอบหน้าส่งออกโดยไม่เข้าถึงข้อมูลจริง</p></aside>
      </div>

      <section className="export-history"><div className="export-history__title"><div><h2>ไฟล์ที่ส่งออกในเซสชันนี้</h2><p>รายการจะถูกรีเซ็ตเมื่อรีเฟรชหน้า</p></div><HardDriveDownload size={19} /></div>{exports.length ? <div className="export-history__list">{exports.map((item) => <article key={item.id}><CheckCircle2 size={17} /><div><strong>{item.name}</strong><small>{item.scope} · {item.createdAt}</small></div><span>{item.format.toUpperCase()}</span></article>)}</div> : <div className="export-history__empty"><HardDriveDownload size={20} /><strong>ยังไม่มีไฟล์ที่ส่งออก</strong><p>เลือกรูปแบบไฟล์ แล้วสร้างไฟล์ตัวอย่างรายการแรก</p></div>}</section>
    </AccountShell>
  );
}
