"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Bookmark, Building2, CheckCircle2, Copy, Download, HelpCircle, Printer, Sparkles, Star, UserPlus } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import {
  getMatchReasons,
  getQualificationMatch,
  getTor,
  getTorDocuments,
  listSavedTors,
  MatchReasonsResult,
  QualificationMatchResult,
  saveTor,
  TorDetail,
  TorDocument,
  unsaveTor,
} from "@/lib/tor-api";
import { escapePrintableText, openPrintableReport } from "@/lib/print-export";

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

const STAGE_BADGE_CLASS: Record<string, string> = {
  bidding_open: "tor-pill--positive",
  awarded: "tor-pill--neutral",
  cancelled: "tor-pill--negative",
};

const PROJECT_TYPE_LABEL: Record<string, string> = {
  web_application: "เว็บแอปพลิเคชัน",
  mobile_application: "แอปพลิเคชันมือถือ",
  it_system: "ระบบไอที",
  other: "ซอฟต์แวร์อื่นๆ",
};

const PROCUREMENT_METHOD_LABEL: Record<string, string> = {
  e_bidding: "ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)",
  selection: "วิธีคัดเลือก",
  special_method: "วิธีพิเศษ",
  specific_method: "วิธีเฉพาะเจาะจง",
  other: "อื่นๆ",
};

const COMPLEXITY_LABEL: Record<string, string> = { low: "ต่ำ", medium: "ปานกลาง", high: "สูง" };

const REQUIREMENT_TYPE_LABEL: Record<string, string> = {
  certification: "ใบรับรอง",
  contract_value: "มูลค่าสัญญาสะสม",
  experience_years: "ประสบการณ์",
};

// FR-VEN-01: the system never makes or implies an eligibility decision — so
// every label here stays a neutral, factual comparison ("matches what's
// stated" / "not yet specified"), never a verdict like "eligible"/"passed".
const QUALIFICATION_OVERALL_LABEL: Record<string, string> = {
  all_met: "โปรไฟล์ของคุณตรงตามคุณสมบัติที่ระบุไว้ทุกข้อ",
  gaps_found: "มีบางข้อที่โปรไฟล์ของคุณยังไม่ตรงตามที่ระบุไว้ — ดูรายละเอียดด้านล่าง",
  undetermined: "โปรไฟล์ของคุณยังไม่ได้ระบุข้อมูลที่จะเทียบกับคุณสมบัติเหล่านี้ได้ครบถ้วน",
};

function formatThb(value: number) {
  return `฿${new Intl.NumberFormat("th-TH").format(value)}`;
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" }) : null;
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

  const [reasonsResult, setReasonsResult] = useState<MatchReasonsResult | null>(null);
  const [qualMatch, setQualMatch] = useState<QualificationMatchResult | null>(null);

  const [linkCopied, setLinkCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [bookmarkReady, setBookmarkReady] = useState(false);
  const [bookmarkPending, setBookmarkPending] = useState(false);
  const [bookmarkError, setBookmarkError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

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
    getTorDocuments(torId)
      .then((result) => { if (!cancelled) setDocuments(result); })
      .catch(() => { if (!cancelled) setDocuments([]); });
    return () => { cancelled = true; };
  }, [torId]);

  const viewerRole = !ready ? null : !user ? "guest" : user.role === "vendor" ? "vendor" : "other";

  useEffect(() => {
    if (viewerRole !== "vendor" || !token) {
      setIsSaved(false);
      setBookmarkReady(true);
      return;
    }
    let cancelled = false;
    setBookmarkReady(false);
    setBookmarkError(null);
    listSavedTors(token)
      .then((bookmarks) => { if (!cancelled) setIsSaved(bookmarks.some(({ tor }) => tor._id === torId)); })
      .catch(() => { if (!cancelled) setBookmarkError("ไม่สามารถตรวจสอบรายการที่บันทึกไว้ได้"); })
      .finally(() => { if (!cancelled) setBookmarkReady(true); });
    return () => { cancelled = true; };
  }, [viewerRole, token, torId]);

  useEffect(() => {
    if (viewerRole !== "vendor" || !token) return;
    let cancelled = false;
    getMatchReasons(torId, token)
      .then((result) => { if (!cancelled) setReasonsResult(result); })
      .catch(() => { if (!cancelled) setReasonsResult(null); });
    return () => { cancelled = true; };
  }, [viewerRole, token, torId]);

  useEffect(() => {
    if (viewerRole !== "vendor" || !token) return;
    let cancelled = false;
    getQualificationMatch(torId, token)
      .then((result) => { if (!cancelled) setQualMatch(result); })
      .catch(() => { if (!cancelled) setQualMatch(null); });
    return () => { cancelled = true; };
  }, [viewerRole, token, torId]);

  function fallbackCopy(text: string): boolean {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }

  function copyLink() {
    const url = window.location.href;
    setCopyError(false);
    const showCopied = () => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1800); };
    const showError = () => { setCopyError(true); setTimeout(() => setCopyError(false), 2400); };

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(showCopied, () => {
        // Permission denied or unsupported (older browsers, some sandboxed
        // contexts) — fall back to the classic execCommand technique before
        // giving up, so a real user still gets a working "copy link."
        if (fallbackCopy(url)) showCopied();
        else showError();
      });
    } else if (fallbackCopy(url)) {
      showCopied();
    } else {
      showError();
    }
  }

  async function toggleBookmark() {
    if (!token || viewerRole !== "vendor" || bookmarkPending) return;
    setBookmarkPending(true);
    setBookmarkError(null);
    try {
      const result = isSaved ? await unsaveTor(torId, token) : await saveTor(torId, token);
      setIsSaved(result.saved);
    } catch (error: unknown) {
      setBookmarkError(error instanceof Error ? error.message : "ไม่สามารถบันทึกโครงการได้");
    } finally {
      setBookmarkPending(false);
    }
  }

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
  const requiredCertifications = tor.qualifications?.requiredCertifications ?? [];
  const highlights = [...deliverables, ...evaluationCriteria, ...keyRisks];

  const announcementDate = tor.timeline?.announcementDate ? String(tor.timeline.announcementDate) : null;
  const submissionDeadline = tor.timeline?.submissionDeadline ? String(tor.timeline.submissionDeadline) : null;
  const deadlineKeyDate = tor.keyDates.find((d) => d.key === "submissionDeadline");

  let progressPct: number | null = null;
  if (announcementDate && submissionDeadline) {
    const start = new Date(announcementDate).getTime();
    const end = new Date(submissionDeadline).getTime();
    const now = Date.now();
    if (end > start) progressPct = Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100));
  }

  const primaryDocument = documents?.find((d) => d.fileUrl) ?? null;
  const summaryText = tor.summaryAi?.text ?? (tor.fields.description?.value ? String(tor.fields.description.value) : null);

  function exportSummary() {
    // The state can change after this click (for example during a route
    // transition), so export the exact record currently on screen.
    const currentTor = tor;
    if (!currentTor) return;
    const list = (items: string[]) => items.length ? `<ul>${items.map((item) => `<li>${escapePrintableText(item)}</li>`).join("")}</ul>` : "ไม่ระบุ";
    const row = (label: string, value: string) => `<tr><th>${escapePrintableText(label)}</th><td>${value}</td></tr>`;
    const sourceUrl = currentTor.source?.sourceUrl;
    let sourceMarkup = "ไม่ระบุ";
    if (sourceUrl) {
      try {
        const parsed = new URL(sourceUrl);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          const safeUrl = escapePrintableText(sourceUrl);
          sourceMarkup = `<a href="${safeUrl}" target="_blank" rel="noreferrer">${safeUrl}</a>`;
        }
      } catch { /* An invalid source stays explicitly unspecified. */ }
    }
    const qualificationItems = [
      ...(currentTor.qualifications?.requiredCertifications ?? []).map((item) => `ใบรับรอง: ${item}`),
      currentTor.qualifications?.minContractValueThb == null ? null : `มูลค่าสัญญาขั้นต่ำ ${formatThb(currentTor.qualifications.minContractValueThb)}`,
      currentTor.qualifications?.requiredExperienceYears == null ? null : `ประสบการณ์ขั้นต่ำ ${currentTor.qualifications.requiredExperienceYears} ปี`,
      ...(currentTor.qualifications?.items ?? []),
    ].filter((item): item is string => Boolean(item));
    const markup = `<h1>${escapePrintableText(currentTor.title)}</h1>
      <div class="meta"><strong>${escapePrintableText(currentTor.agencyName)}</strong><br>วันที่ระบบเก็บข้อมูล: ${escapePrintableText(formatDate(currentTor.source?.discoveredAt) ?? "ไม่ระบุ")}</div>
      <h2>สรุปโครงการ</h2><p>${escapePrintableText(summaryText ?? "ไม่ระบุ")}</p>
      <h2>ข้อมูล TOR</h2><table><tbody>
        ${row("งบประมาณ", escapePrintableText(typeof budget === "number" ? formatThb(budget) : "ไม่ระบุ"))}
        ${row("กำหนดส่งข้อเสนอ", escapePrintableText(formatDate(submissionDeadline) ?? "ไม่ระบุ"))}
        ${row("วันที่ประกาศ", escapePrintableText(formatDate(announcementDate) ?? "ไม่ระบุ"))}
        ${row("เทคโนโลยีที่ต้องใช้", list(requiredTechnologies))}
        ${row("คุณสมบัติผู้ยื่นข้อเสนอ", list(qualificationItems))}
        ${row("เกณฑ์การประเมิน", list(evaluationCriteria))}
        ${row("สิ่งที่ต้องส่งมอบ", list(deliverables))}
        ${row("แหล่งข้อมูลต้นทาง", sourceMarkup)}
      </tbody></table>
      <div class="notice"><strong>ข้อควรทราบ:</strong> เอกสารนี้อาจมีสรุปหรือข้อมูลที่ระบบ AI สกัดจากเอกสารต้นทาง จึงใช้เพื่อประกอบการพิจารณาเท่านั้น โปรดตรวจสอบกับเอกสารและแหล่งข้อมูลต้นทางก่อนตัดสินใจ</div>`;
    if (!openPrintableReport({ title: `สรุป TOR - ${currentTor.title}`, bodyHtml: markup })) {
      setExportError("เบราว์เซอร์บล็อกหน้าต่างส่งออก โปรดอนุญาต pop-up แล้วลองอีกครั้ง");
    } else {
      setExportError(null);
    }
  }

  return (
    <main className="tor-detail-page">
      <div className="tor-detail-layout">
        <div className="tor-detail-main">
          <section className="tor-hero-card">
            <div className="tor-hero-card__badges">
              <div className="tor-pill-group">
                {tor.projectType && <span className="tor-pill tor-pill--info">{PROJECT_TYPE_LABEL[tor.projectType] ?? tor.projectType}</span>}
                <span className={`tor-pill ${STAGE_BADGE_CLASS[stage] ?? "tor-pill--info"}`}>{STAGE_LABEL[stage] ?? stage}</span>
              </div>
              {viewerRole === "vendor" && reasonsResult && (
                <span className="tor-match-score"><Star size={14} />{Math.round(reasonsResult.score * 100)}% ตรงกับโปรไฟล์ของคุณ</span>
              )}
            </div>

            <h1 className="tor-hero-card__title">{tor.title}</h1>
            {tor.fields.referenceNumber?.value ? <p className="tor-detail-reference">เลขที่อ้างอิง: {String(tor.fields.referenceNumber.value)}</p> : null}

            <div className="tor-info-strip">
              <div>
                <span>งบประมาณโดยประมาณ</span>
                <strong className="tor-info-strip__budget">{typeof budget === "number" ? formatThb(budget) : "ไม่ระบุ"}</strong>
              </div>
              <div>
                <span>กำหนดส่งข้อเสนอ</span>
                <strong>{formatDate(submissionDeadline) ?? "ไม่ระบุ"}</strong>
              </div>
              <div>
                <span>หน่วยงานผู้ประกาศ</span>
                <strong className="tor-info-strip__agency">{tor.agencyName}</strong>
              </div>
            </div>

            <div className="tor-hero-card__section">
              <h2>สรุปโครงการ</h2>
              {summaryText ? (
                <>
                  <p>{summaryText}</p>
                  {tor.summaryAi && <span className="ai-summary-disclaimer">สรุปโดยระบบ AI — ไม่ใช่ข้อมูลที่เป็นทางการ</span>}
                </>
              ) : (
                <p className="tor-detail-empty-note">ยังไม่มีข้อมูลสรุปโครงการ</p>
              )}
            </div>

            <div className="tor-hero-card__section">
              <h2>รายละเอียดแพลตฟอร์ม</h2>
              <div className="tor-requirement-table">
                {formatDate(announcementDate) && (
                  <div><span>วันที่ประกาศ</span><span>{formatDate(announcementDate)}</span></div>
                )}
                {tor.fields.procurementMethod?.value ? (
                  <div><span>วิธีการจัดซื้อจัดจ้าง</span><span>{PROCUREMENT_METHOD_LABEL[String(tor.fields.procurementMethod.value)] ?? String(tor.fields.procurementMethod.value)}</span></div>
                ) : null}
                {requiredTechnologies.length > 0 && (
                  <div><span>เทคโนโลยีที่ต้องใช้</span><span>{requiredTechnologies.join(", ")}</span></div>
                )}
                {requiredCertifications.length > 0 && (
                  <div><span>ใบรับรองที่ต้องมี</span><span>{requiredCertifications.join(", ")}</span></div>
                )}
                {tor.fields.estimatedComplexity?.value ? (
                  <div><span>ความซับซ้อนของโครงการ</span><span>{COMPLEXITY_LABEL[String(tor.fields.estimatedComplexity.value)] ?? String(tor.fields.estimatedComplexity.value)}</span></div>
                ) : null}
              </div>
            </div>
          </section>

          {tor.outlier?.isOutlier && (
            <section className="panel outlier-panel">
              <div className="panel-title"><h2><AlertTriangle size={16} />งบประมาณผิดปกติจากค่าเฉลี่ย</h2></div>
              <p>{tor.outlier.signal}</p>
            </section>
          )}

          {highlights.length > 0 && (
            <section className="tor-ai-callout">
              <div className="tor-ai-callout__title"><Sparkles size={20} /><h2>สรุปข้อกำหนดสำคัญโดย AI</h2></div>
              <p>โมเดลภาษาของเราสกัดประเด็นสำคัญเหล่านี้จากเอกสารต้นฉบับ:</p>
              <ul>
                {highlights.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
              </ul>
            </section>
          )}

          {viewerRole === "vendor" && qualMatch && qualMatch.overallStatus !== "no_requirements" && (
            <section className="panel qualification-panel">
              <div className="panel-title"><h2>คุณสมบัติของคุณเทียบกับที่ TOR ระบุไว้</h2></div>
              <p className="qualification-panel__summary">{QUALIFICATION_OVERALL_LABEL[qualMatch.overallStatus]}</p>
              <ul className="qualification-list">
                {qualMatch.requirements.map((req, index) => (
                  <li key={`${req.type}-${index}`} className={`qualification-list__item qualification-list__item--${req.status}`}>
                    {req.status === "met" ? (
                      <CheckCircle2 size={16} />
                    ) : req.status === "not_met" ? (
                      <AlertTriangle size={16} />
                    ) : (
                      <HelpCircle size={16} />
                    )}
                    <div>
                      <strong>{REQUIREMENT_TYPE_LABEL[req.type] ?? req.type}</strong>
                      <span>
                        {req.status === "not_met" && req.gap
                          ? req.gap
                          : req.status === "undetermined"
                            ? `TOR ระบุไว้ที่ ${req.required} — โปรไฟล์ของคุณยังไม่ได้ระบุข้อมูลนี้`
                            : `ตรงตามที่ระบุไว้ (${req.required}${req.declared ? ` — โปรไฟล์ของคุณ: ${req.declared}` : ""})`}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="tor-detail-sidebar">
          <section className="tor-sidebar-card">
            <h2>การดำเนินการ</h2>
            <div className="tor-sidebar-actions">
              {primaryDocument?.fileUrl ? (
                <a
                  className="tor-action-button tor-action-button--primary"
                  href={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api"}${primaryDocument.fileUrl}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download size={16} />ดาวน์โหลดเอกสาร TOR ต้นฉบับ
                </a>
              ) : (
                <button className="tor-action-button tor-action-button--primary" type="button" disabled>
                  <Download size={16} />ไม่มีเอกสารต้นฉบับให้ดาวน์โหลด
                </button>
              )}
              {viewerRole === "vendor" ? (
                <button className="tor-action-button" type="button" onClick={toggleBookmark} disabled={!bookmarkReady || bookmarkPending} aria-pressed={isSaved}>
                  <Bookmark size={15} fill={isSaved ? "currentColor" : "none"} />
                  {bookmarkPending ? "กำลังบันทึก..." : !bookmarkReady ? "กำลังตรวจสอบ..." : isSaved ? "ยกเลิกการบันทึก" : "บันทึกโครงการ"}
                </button>
              ) : viewerRole === "guest" ? (
                <Link className="tor-action-button" href="/login"><Bookmark size={15} />เข้าสู่ระบบเพื่อบันทึก</Link>
              ) : (
                <button className="tor-action-button" type="button" disabled><Bookmark size={15} />บันทึกได้เฉพาะผู้ขาย</button>
              )}
              <button className="tor-action-button" type="button" onClick={copyLink}>
                <Copy size={15} />{linkCopied ? "คัดลอกลิงก์แล้ว" : copyError ? "คัดลอกลิงก์ไม่สำเร็จ" : "แชร์โครงการ"}
              </button>
              <button className="tor-action-button" type="button" onClick={exportSummary}>
                <Printer size={15} />ส่งออกสรุป / บันทึก PDF
              </button>
            </div>
            {bookmarkError && <p className="tor-bookmark-error" role="alert">{bookmarkError}</p>}
            {exportError && <p className="tor-bookmark-error" role="alert">{exportError}</p>}
            {deadlineKeyDate?.date && (
              <>
                <hr className="tor-sidebar-divider" />
                <div className="tor-days-remaining">
                  <div className="tor-days-remaining__row">
                    <span>วันที่เหลือ</span>
                    <strong>{deadlineKeyDate.isPast ? `ผ่านไปแล้ว ${Math.abs(deadlineKeyDate.daysRemaining ?? 0)} วัน` : `เหลืออีก ${deadlineKeyDate.daysRemaining} วัน`}</strong>
                  </div>
                  {progressPct != null && (
                    <div className="tor-progress-track"><div className="tor-progress-fill" style={{ width: `${progressPct}%` }} /></div>
                  )}
                </div>
              </>
            )}
          </section>

          {viewerRole === "vendor" && reasonsResult && reasonsResult.reasons.length > 0 && (
            <section className="tor-sidebar-card">
              <h2>ทำไมโครงการนี้ตรงกับคุณ</h2>
              <ul className="tor-match-reasons">
                {reasonsResult.reasons.map((reason, index) => (
                  <li key={`${reason.type}-${index}`}>
                    <strong>{reason.label}</strong>
                    <span>{reason.detail}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="tor-sidebar-card">
            <h2>หน่วยงานผู้รับผิดชอบ</h2>
            <div className="tor-department">
              <span className="tor-department__icon"><Building2 size={18} /></span>
              <div>
                <strong>{tor.agencyName}</strong>
                {tor.agencyContact?.address && <span>{tor.agencyContact.address}</span>}
              </div>
            </div>
            {(tor.agencyContact?.email || tor.agencyContact?.phone) ? (
              <>
                <hr className="tor-sidebar-divider" />
                <div className="tor-department-contact">
                  {tor.agencyContact.email && <p>อีเมล: {tor.agencyContact.email}</p>}
                  {tor.agencyContact.phone && <p>โทรศัพท์: {tor.agencyContact.phone}</p>}
                </div>
              </>
            ) : (
              <p className="tor-detail-empty-note">
                ยังไม่มีข้อมูลติดต่อโดยตรง{tor.source?.sourceUrl ? <> — ดูรายละเอียดที่ <a href={tor.source.sourceUrl} target="_blank" rel="noreferrer">เว็บไซต์ต้นทาง</a></> : null}
              </p>
            )}
          </section>

          {viewerRole === "guest" && (
            <section className="tor-sidebar-card tor-sidebar-card--prompt">
              <UserPlus size={22} />
              <h2>สมัครสมาชิกเพื่อดูว่าโครงการนี้ตรงกับคุณอย่างไร</h2>
              <p>เข้าสู่ระบบในฐานะผู้ขายและกรอกโปรไฟล์ เพื่อดูคะแนนความตรงกันและเหตุผลที่ตรงกับความสนใจของคุณ</p>
              <div className="tor-sidebar-card--prompt__actions">
                <Link href="/register" className="button button--primary button--small">สมัครใช้งาน</Link>
                <Link href="/login" className="text-link">เข้าสู่ระบบ</Link>
              </div>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
