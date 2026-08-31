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
  const [scope, setScope] = useState("Operations and audit history");
  const [range, setRange] = useState("All available mock records");
  const [exports, setExports] = useState<ExportRecord[]>([]);
  const [notice, setNotice] = useState("");
  const { recordEvent } = useAdminAudit();

  function exportRepository() {
    const generatedAt = new Date().toISOString();
    const filename = `city-of-software-repository-${new Date().toISOString().slice(0, 10)}.${format}`;
    const content = format === "json"
      ? JSON.stringify({ generatedAt, scope, range, previewRecords: repositoryPreview, note: "Frontend-only repository export. No source documents or production records are included." }, null, 2)
      : ["record_type,name,status", ...repositoryPreview.map((record) => `${record.recordType},${record.name},${record.status}`)].join("\n");
    downloadFile(content, filename, format === "json" ? "application/json" : "text/csv");
    setExports((current) => [{ id: `${Date.now()}`, name: filename, format, scope, createdAt: "Just now" }, ...current]);
    setNotice("Mock export generated and downloaded to your browser.");
    recordEvent({ category: "Repository", action: "Exported repository", target: filename, details: `Generated a ${format.toUpperCase()} browser-only export for ${scope}.` });
  }

  return (
    <AccountShell allowedRoles={["admin"]}>
      <header className="account-header export-repository__header"><div><p className="login-kicker">DATA PORTABILITY</p><h1>Export Repository</h1><p>Create a portable copy of operational settings and audit history. Source TOR documents are intentionally outside this frontend prototype.</p></div><span className="export-repository__secure"><ShieldCheck size={16} /> Admin-only export</span></header>

      {notice && <div className="role-management__notice" role="status">{notice}<button type="button" onClick={() => setNotice("")}>Dismiss</button></div>}

      <div className="export-repository__layout">
        <section className="export-repository__card">
          <div className="export-repository__title"><FolderArchive size={19} /><div><h2>Prepare an export</h2><p>Choose the shape of the browser-generated mock file.</p></div></div>
          <label className="export-field"><span>Repository scope</span><select value={scope} onChange={(event) => setScope(event.target.value)}><option>Operations and audit history</option><option>Agency scheduling configuration</option><option>Account access configuration</option></select></label>
          <label className="export-field"><span>Record range</span><select value={range} onChange={(event) => setRange(event.target.value)}><option>All available mock records</option><option>Latest operational snapshot</option><option>Latest audit activity only</option></select></label>
          <fieldset className="export-format"><legend>File format</legend><label className={format === "json" ? "selected" : ""}><input type="radio" name="format" value="json" checked={format === "json"} onChange={() => setFormat("json")} /><FileJson2 size={19} /><span><strong>JSON archive</strong><small>Structured metadata for system migration</small></span></label><label className={format === "csv" ? "selected" : ""}><input type="radio" name="format" value="csv" checked={format === "csv"} onChange={() => setFormat("csv")} /><FileSpreadsheet size={19} /><span><strong>CSV table</strong><small>Flat summary suitable for spreadsheets</small></span></label></fieldset>
          <button className="button button--primary export-repository__submit" type="button" onClick={exportRepository}><Download size={16} /> Generate and download {format.toUpperCase()}</button>
        </section>

        <aside className="export-repository__preview"><Info size={18} /><h2>Included in this demo</h2><ul><li>Agency monitoring settings</li><li>Adapter health snapshot</li><li>Administrative audit events</li></ul><p>The download contains three mock records so the export UI can be tested without accessing production data.</p></aside>
      </div>

      <section className="export-history"><div className="export-history__title"><div><h2>Exports created this session</h2><p>Records reset after a page refresh.</p></div><HardDriveDownload size={19} /></div>{exports.length ? <div className="export-history__list">{exports.map((item) => <article key={item.id}><CheckCircle2 size={17} /><div><strong>{item.name}</strong><small>{item.scope} · {item.createdAt}</small></div><span>{item.format.toUpperCase()}</span></article>)}</div> : <div className="export-history__empty"><HardDriveDownload size={20} /><strong>No exports yet</strong><p>Choose a format, then generate the first mock export.</p></div>}</section>
    </AccountShell>
  );
}
