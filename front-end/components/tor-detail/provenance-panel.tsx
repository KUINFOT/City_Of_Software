import { Building2, Download, FileWarning, Globe2, History } from "lucide-react";
import type { TorDocument, TorSource } from "@/lib/tor-api";

const IMPORT_METHOD_LABEL: Record<'scrape' | 'manual', string> = {
  scrape: "รวบรวมข้อมูลอัตโนมัติจากเว็บไซต์หน่วยงาน",
  manual: "นำเข้าโดยผู้ดูแลระบบ",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("th-TH", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ProvenancePanel({
  agencyName,
  source,
  documents,
  documentsLoading,
}: {
  agencyName: string;
  source: TorSource;
  documents: TorDocument[] | null;
  documentsLoading: boolean;
}) {
  return (
    <article className="panel provenance-panel">
      <div className="panel-title">
        <h2>แหล่งที่มาและเอกสารต้นฉบับ</h2>
      </div>

      <div className="provenance-facts">
        <span><Building2 size={15} />{agencyName}</span>
        {source?.sourceUrl && (
          <span>
            <Globe2 size={15} />
            <a href={source.sourceUrl} target="_blank" rel="noreferrer">{source.sourceUrl}</a>
          </span>
        )}
        {source?.discoveredAt && (
          <span><History size={15} />บันทึกเมื่อ {formatDateTime(source.discoveredAt)}</span>
        )}
        {source?.importMethod && <span className="provenance-import-method">{IMPORT_METHOD_LABEL[source.importMethod]}</span>}
      </div>

      <div className="provenance-documents">
        {documentsLoading ? (
          <p className="provenance-empty">กำลังโหลดเอกสารต้นฉบับ...</p>
        ) : !documents || documents.length === 0 ? (
          <p className="provenance-empty">TOR นี้ยังไม่มีเอกสารต้นฉบับที่บันทึกไว้</p>
        ) : (
          documents.map((doc) => (
            <div className="provenance-document" key={doc._id}>
              <div>
                <strong>{doc.originalName}</strong>
                <small>บันทึกเมื่อ {formatDateTime(doc.capturedAt)}{doc.label ? ` · ${doc.label}` : ""}</small>
              </div>
              {doc.fileUrl ? (
                <a
                  className="button button--small button--primary"
                  href={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api"}${doc.fileUrl}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download size={14} />ดูเอกสารต้นฉบับ
                </a>
              ) : (
                <span className="provenance-unavailable"><FileWarning size={14} />ไม่มีเอกสารต้นฉบับให้ดาวน์โหลด</span>
              )}
            </div>
          ))
        )}
      </div>
    </article>
  );
}
