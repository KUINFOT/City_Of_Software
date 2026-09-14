"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Sparkles } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { KeyDatesPanel } from "@/components/tor-detail/key-dates-panel";
import { ProvenancePanel } from "@/components/tor-detail/provenance-panel";
import { QualificationMatchPanel } from "@/components/tor-detail/qualification-match-panel";
import { MatchReasonsPanel } from "@/components/tor-detail/match-reasons-panel";
import {
  getMatchReasons,
  getQualificationMatch,
  getTor,
  getTorDocuments,
  MatchReasonsResult,
  QualificationMatchResult,
  TorDetail,
  TorDocument,
} from "@/lib/tor-api";

const STAGE_LABEL: Record<string, string> = {
  plan: "อยู่ระหว่างวางแผน",
  draft_tor: "ร่าง TOR",
  spec: "อยู่ระหว่างจัดทำรายละเอียด",
  price_reference: "อยู่ระหว่างพิจารณาราคากลาง",
  bidding_open: "เปิดรับข้อเสนอ",
  awarded: "ประกาศผลแล้ว",
  cancelled: "ยกเลิก",
  other: "อยู่ระหว่างดำเนินการ",
};

const STAGE_CLASS: Record<string, string> = {
  bidding_open: "tor-status--open",
  draft_tor: "tor-status--draft",
  awarded: "tor-status--awarded",
  cancelled: "tor-status--cancelled",
};

const PROCUREMENT_METHOD_LABEL: Record<string, string> = {
  e_bidding: "ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)",
  selection: "วิธีคัดเลือก",
  special_method: "วิธีพิเศษ",
  specific_method: "วิธีเฉพาะเจาะจง",
  other: "อื่นๆ",
};

const COMPLEXITY_LABEL: Record<string, string> = { low: "ต่ำ", medium: "ปานกลาง", high: "สูง" };

function formatThb(value: number) {
  return `${new Intl.NumberFormat("th-TH").format(value)} บาท`;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item : typeof item === "object" && item && "criterion" in item ? String((item as { criterion?: unknown }).criterion ?? "") : ""))
    .filter(Boolean);
}

export function TorDetailClient() {
  const params = useParams<{ id: string }>();
  const torId = params.id;
  const { user, token, ready } = useAuth();

  const [tor, setTor] = useState<TorDetail | null>(null);
  const [torError, setTorError] = useState<string | null>(null);
  const [torLoading, setTorLoading] = useState(true);

  const [documents, setDocuments] = useState<TorDocument[] | null>(null);
  const [documentsLoading, setDocumentsLoading] = useState(true);

  const [matchResult, setMatchResult] = useState<QualificationMatchResult | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);

  const [reasonsResult, setReasonsResult] = useState<MatchReasonsResult | null>(null);
  const [reasonsLoading, setReasonsLoading] = useState(false);
  const [reasonsError, setReasonsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTorLoading(true);
    setTorError(null);
    getTor(torId)
      .then((result) => { if (!cancelled) setTor(result); })
      .catch((error: unknown) => { if (!cancelled) setTorError(error instanceof Error ? error.message : "ไม่พบ TOR ที่ต้องการ"); })
      .finally(() => { if (!cancelled) setTorLoading(false); });
    return () => { cancelled = true; };
  }, [torId]);

  useEffect(() => {
    let cancelled = false;
    setDocumentsLoading(true);
    getTorDocuments(torId)
      .then((result) => { if (!cancelled) setDocuments(result); })
      .catch(() => { if (!cancelled) setDocuments([]); })
      .finally(() => { if (!cancelled) setDocumentsLoading(false); });
    return () => { cancelled = true; };
  }, [torId]);

  const viewerRole = !ready ? null : !user ? "guest" : user.role === "vendor" ? "vendor" : "other";

  useEffect(() => {
    if (viewerRole !== "vendor" || !token) return;
    let cancelled = false;
    setMatchLoading(true);
    setMatchError(null);
    getQualificationMatch(torId, token)
      .then((result) => { if (!cancelled) setMatchResult(result); })
      .catch((error: unknown) => { if (!cancelled) setMatchError(error instanceof Error ? error.message : "ไม่สามารถตรวจสอบคุณสมบัติได้ในขณะนี้"); })
      .finally(() => { if (!cancelled) setMatchLoading(false); });
    return () => { cancelled = true; };
  }, [viewerRole, token, torId]);

  useEffect(() => {
    if (viewerRole !== "vendor" || !token) return;
    let cancelled = false;
    setReasonsLoading(true);
    setReasonsError(null);
    getMatchReasons(torId, token)
      .then((result) => { if (!cancelled) setReasonsResult(result); })
      .catch((error: unknown) => { if (!cancelled) setReasonsError(error instanceof Error ? error.message : "ไม่สามารถตรวจสอบเหตุผลที่ตรงกันได้ในขณะนี้"); })
      .finally(() => { if (!cancelled) setReasonsLoading(false); });
    return () => { cancelled = true; };
  }, [viewerRole, token, torId]);

  if (torLoading || !ready) {
    return <main className="tor-detail-page"><p className="tor-detail-loading">กำลังโหลดข้อมูล TOR...</p></main>;
  }

  if (torError || !tor) {
    return (
      <main className="tor-detail-page">
        <div className="empty-state">
          <AlertTriangle size={26} />
          <h3>ไม่พบ TOR ที่ต้องการ</h3>
          <p>{torError ?? "รายการนี้อาจถูกลบหรือยังไม่ได้เผยแพร่"}</p>
        </div>
      </main>
    );
  }

  const stage = tor.lifecycle?.stage ?? "other";
  const budget = tor.fields.budget?.value;
  const requiredTechnologies = asStringArray(tor.fields.requiredTechnologies?.value);
  const deliverables = asStringArray(tor.fields.deliverables?.value);
  const keyRisks = asStringArray(tor.fields.keyRisks?.value);
  const evaluationCriteria = asStringArray(tor.fields.evaluationCriteria?.value);

  return (
    <main className="tor-detail-page">
      <section className="tor-detail-header panel">
        <div className="tor-detail-header__top">
          <span className="tor-category">{tor.agencyName}</span>
          <span className={`tor-status ${STAGE_CLASS[stage] ?? "tor-status--in-progress"}`}>{STAGE_LABEL[stage] ?? stage}</span>
        </div>
        <h1>{tor.title}</h1>
        {tor.fields.referenceNumber?.value ? <p className="tor-detail-reference">เลขที่อ้างอิง: {String(tor.fields.referenceNumber.value)}</p> : null}
      </section>

      {tor.summaryAi && (
        <section className="panel ai-summary-panel">
          <div className="panel-title">
            <h2><Sparkles size={16} />สรุปโดย AI</h2>
            <span className="ai-summary-disclaimer">สรุปโดยระบบ AI — ไม่ใช่ข้อมูลที่เป็นทางการ</span>
          </div>
          <p>{tor.summaryAi.text}</p>
        </section>
      )}

      {tor.outlier?.isOutlier && (
        <section className="panel outlier-panel">
          <div className="panel-title"><h2><AlertTriangle size={16} />งบประมาณผิดปกติจากค่าเฉลี่ย</h2></div>
          <p>{tor.outlier.signal}</p>
        </section>
      )}

      <div className="tor-detail-grid">
        <KeyDatesPanel keyDates={tor.keyDates} />
        <QualificationMatchPanel
          viewerRole={viewerRole ?? "guest"}
          loading={matchLoading}
          error={matchError}
          result={matchResult}
        />
        <MatchReasonsPanel
          viewerRole={viewerRole ?? "guest"}
          loading={reasonsLoading}
          error={reasonsError}
          result={reasonsResult}
        />
      </div>

      <ProvenancePanel agencyName={tor.agencyName} source={tor.source} documents={documents} documentsLoading={documentsLoading} />

      <article className="panel extracted-fields-panel">
        <div className="panel-title"><h2>รายละเอียดที่สกัดโดย AI</h2></div>
        <dl className="extracted-fields-list">
          {tor.fields.procurementMethod?.value ? (
            <div><dt>วิธีการจัดซื้อจัดจ้าง</dt><dd>{PROCUREMENT_METHOD_LABEL[String(tor.fields.procurementMethod.value)] ?? String(tor.fields.procurementMethod.value)}{tor.fields.procurementMethod.caution && <span className="caution-badge">ควรตรวจสอบ</span>}</dd></div>
          ) : null}
          {typeof budget === "number" ? (
            <div><dt>งบประมาณโดยประมาณ</dt><dd>{formatThb(budget)}{tor.fields.budget?.caution && <span className="caution-badge">ควรตรวจสอบ</span>}</dd></div>
          ) : null}
          {tor.fields.estimatedComplexity?.value ? (
            <div><dt>ความซับซ้อนของโครงการ</dt><dd>{COMPLEXITY_LABEL[String(tor.fields.estimatedComplexity.value)] ?? String(tor.fields.estimatedComplexity.value)}</dd></div>
          ) : null}
          {tor.fields.description?.value ? (
            <div><dt>รายละเอียดโครงการ</dt><dd>{String(tor.fields.description.value)}{tor.fields.description.caution && <span className="caution-badge">ควรตรวจสอบ</span>}</dd></div>
          ) : null}
          {requiredTechnologies.length > 0 && (
            <div><dt>เทคโนโลยีที่ต้องใช้</dt><dd><div className="tor-tags">{requiredTechnologies.map((tech) => <span key={tech}>{tech}</span>)}</div></dd></div>
          )}
          {deliverables.length > 0 && (
            <div><dt>ผลงานที่ต้องส่งมอบ</dt><dd><ul>{deliverables.map((item) => <li key={item}>{item}</li>)}</ul></dd></div>
          )}
          {evaluationCriteria.length > 0 && (
            <div><dt>เกณฑ์การประเมิน</dt><dd><ul>{evaluationCriteria.map((item) => <li key={item}>{item}</li>)}</ul></dd></div>
          )}
          {keyRisks.length > 0 && (
            <div><dt>ความเสี่ยงสำคัญ</dt><dd><ul>{keyRisks.map((item) => <li key={item}>{item}</li>)}</ul></dd></div>
          )}
        </dl>
      </article>
    </main>
  );
}
