"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Printer, Scale } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ComparisonTor, previewTorComparison } from "@/lib/tor-api";
import { escapePrintableText, openPrintableReport } from "@/lib/print-export";

function formatThb(value: number | null): string {
  return value == null ? "ไม่ระบุ" : `฿${new Intl.NumberFormat("th-TH").format(value)}`;
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" }) : "ไม่ระบุ";
}

function BudgetCell({ budget }: { budget: ComparisonTor["budget"] }) {
  if (!budget) return <>ไม่ระบุ</>;
  const basis = budget.vatBasis === "inclusive" ? "รวม VAT" : budget.vatBasis === "exclusive" ? "ไม่รวม VAT" : "ไม่ระบุฐาน VAT";
  return <><strong>{formatThb(budget.amountThb)}</strong><small>{budget.isEstimated ? "งบประมาณโดยประมาณ" : "วงเงินที่ระบุ"} · {basis}</small></>;
}

function DurationCell({ tor }: { tor: ComparisonTor }) {
  const { projectDurationDays, contractStartDate, contractEndDate, submissionDeadline } = tor.timeline;
  return <>
    <strong>{projectDurationDays == null ? "ไม่ระบุระยะเวลา" : `${projectDurationDays} วัน`}</strong>
    {(contractStartDate || contractEndDate) && <small>สัญญา: {formatDate(contractStartDate)} – {formatDate(contractEndDate)}</small>}
    <small>กำหนดส่งข้อเสนอ: {formatDate(submissionDeadline)}</small>
  </>;
}

function ListCell({ values }: { values: string[] }) {
  return values.length ? <ul>{values.map((value) => <li key={value}>{value}</li>)}</ul> : <>ไม่ระบุ</>;
}

function QualificationsCell({ qualifications }: { qualifications: ComparisonTor["qualifications"] }) {
  if (!qualifications) return <>ไม่ระบุ</>;
  const facts = [
    qualifications.minContractValueThb == null ? null : `มูลค่าสัญญาขั้นต่ำ ${formatThb(qualifications.minContractValueThb)}`,
    qualifications.requiredExperienceYears == null ? null : `ประสบการณ์ขั้นต่ำ ${qualifications.requiredExperienceYears} ปี`,
    ...qualifications.requiredCertifications.map((item) => `ใบรับรอง: ${item}`),
    ...qualifications.items,
  ].filter((value): value is string => Boolean(value));
  return <ListCell values={facts} />;
}

function CriteriaCell({ criteria }: { criteria: ComparisonTor["evaluationCriteria"] }) {
  if (!criteria.length) return <>ไม่ระบุ</>;
  return <ul>{criteria.map(({ criterion, weightPercent }) => <li key={`${criterion}-${weightPercent ?? ""}`}>{criterion}{weightPercent == null ? "" : ` (${weightPercent}%)`}</li>)}</ul>;
}

function qualificationFacts(qualifications: ComparisonTor["qualifications"]): string[] {
  if (!qualifications) return [];
  return [
    qualifications.minContractValueThb == null ? null : `มูลค่าสัญญาขั้นต่ำ ${formatThb(qualifications.minContractValueThb)}`,
    qualifications.requiredExperienceYears == null ? null : `ประสบการณ์ขั้นต่ำ ${qualifications.requiredExperienceYears} ปี`,
    ...qualifications.requiredCertifications.map((item) => `ใบรับรอง: ${item}`),
    ...qualifications.items,
  ].filter((value): value is string => Boolean(value));
}

export function CompareTorsClient() {
  const { user, token, ready } = useAuth();
  const searchParams = useSearchParams();
  const selectedIds = useMemo(() => (searchParams.get("ids") ?? "").split(",").filter(Boolean), [searchParams]);
  const idsKey = selectedIds.join(",");
  const [tors, setTors] = useState<ComparisonTor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!token || user?.role !== "vendor") {
      setLoading(false);
      setError("การเปรียบเทียบ TOR ใช้ได้เฉพาะบัญชีผู้ขายที่เข้าสู่ระบบ");
      return;
    }
    if (selectedIds.length < 2 || selectedIds.length > 4 || new Set(selectedIds).size !== selectedIds.length) {
      setLoading(false);
      setError("กรุณาเลือก TOR ที่บันทึกไว้ 2–4 รายการจากหน้า Dashboard");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    previewTorComparison(selectedIds, token)
      .then((result) => { if (!cancelled) setTors(result); })
      .catch((requestError: unknown) => { if (!cancelled) setError(requestError instanceof Error ? requestError.message : "ไม่สามารถโหลดข้อมูลเปรียบเทียบได้"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [idsKey, ready, token, user?.role]);

  function exportComparison() {
    const list = (values: string[]) => values.length ? `<ul>${values.map((value) => `<li>${escapePrintableText(value)}</li>`).join("")}</ul>` : "ไม่ระบุ";
    const source = (tor: ComparisonTor) => {
      const url = tor.source?.sourceUrl;
      if (!url) return "ไม่ระบุ";
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "ไม่ระบุ";
        const safeUrl = escapePrintableText(url);
        return `<a href="${safeUrl}" target="_blank" rel="noreferrer">${safeUrl}</a><br><small>วันที่ระบบเก็บข้อมูล: ${escapePrintableText(formatDate(tor.source?.discoveredAt ?? null))}</small>`;
      } catch { return "ไม่ระบุ"; }
    };
    const budget = (tor: ComparisonTor) => !tor.budget
      ? "ไม่ระบุ"
      : `${escapePrintableText(formatThb(tor.budget.amountThb))}<br><small>${tor.budget.isEstimated ? "งบประมาณโดยประมาณ" : "วงเงินที่ระบุ"} · ${tor.budget.vatBasis === "inclusive" ? "รวม VAT" : tor.budget.vatBasis === "exclusive" ? "ไม่รวม VAT" : "ไม่ระบุฐาน VAT"}</small>`;
    const duration = (tor: ComparisonTor) => `${escapePrintableText(tor.timeline.projectDurationDays == null ? "ไม่ระบุระยะเวลา" : `${tor.timeline.projectDurationDays} วัน`)}<br><small>กำหนดส่ง: ${escapePrintableText(formatDate(tor.timeline.submissionDeadline))}</small>`;
    const row = (label: string, cells: string[]) => `<tr><th>${escapePrintableText(label)}</th>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
    const report = `<h1>เปรียบเทียบ TOR แบบเคียงข้างกัน</h1>
      <div class="meta">เปรียบเทียบ TOR ที่บันทึกไว้ ${tors.length} รายการ</div>
      <table><thead><tr><th>หัวข้อ</th>${tors.map((tor) => `<th>${escapePrintableText(tor.title)}<br><small>${escapePrintableText(tor.agencyName)}</small></th>`).join("")}</tr></thead><tbody>
        ${row("งบประมาณ", tors.map(budget))}
        ${row("ระยะเวลาและกำหนดส่ง", tors.map(duration))}
        ${row("เทคโนโลยี", tors.map((tor) => list(tor.technologies)))}
        ${row("คุณสมบัติผู้ยื่นข้อเสนอ", tors.map((tor) => list(qualificationFacts(tor.qualifications))))}
        ${row("เกณฑ์การประเมิน", tors.map((tor) => list(tor.evaluationCriteria.map(({ criterion, weightPercent }) => `${criterion}${weightPercent == null ? "" : ` (${weightPercent}%)`}`))))}
        ${row("สิ่งที่ต้องส่งมอบ", tors.map((tor) => list(tor.deliverables)))}
        ${row("แหล่งข้อมูลต้นทาง", tors.map(source))}
      </tbody></table>
      <div class="notice"><strong>ข้อควรทราบ:</strong> ข้อมูลอาจมีส่วนที่ระบบ AI สกัดหรือสรุปจากเอกสารต้นทาง จึงใช้เพื่อประกอบการพิจารณาเท่านั้น โปรดตรวจสอบแหล่งข้อมูลต้นทางก่อนตัดสินใจ</div>`;
    if (!openPrintableReport({ title: "เปรียบเทียบ TOR - City of Software", bodyHtml: report })) {
      setExportError("เบราว์เซอร์บล็อกหน้าต่างส่งออก โปรดอนุญาต pop-up แล้วลองอีกครั้ง");
    } else {
      setExportError(null);
    }
  }

  return (
    <main className="comparison-page">
      <div className="comparison-page__header">
        <Link href="/dashboard#bookmarks" className="comparison-back"><ArrowLeft size={16} />กลับไปเลือก TOR</Link>
        <p className="comparison-kicker"><Scale size={15} />TOR COMPARISON</p>
        <h1>เปรียบเทียบ TOR แบบเคียงข้างกัน</h1>
        <p>ข้อมูลที่ยังไม่ปรากฏใน TOR จะแสดงเป็น “ไม่ระบุ” และระบบจะแสดงฐานภาษีของงบประมาณตามเอกสารต้นทาง โดยไม่ปรับให้เท่ากัน</p>
        {!loading && !error && <button className="comparison-export" type="button" onClick={exportComparison}><Printer size={15} />ส่งออก / บันทึก PDF</button>}
        {exportError && <p className="comparison-export-error" role="alert">{exportError}</p>}
      </div>

      {loading ? <p className="comparison-state">กำลังโหลดข้อมูลเปรียบเทียบ...</p> : error ? <section className="comparison-state" role="alert"><p>{error}</p><Link className="button button--primary" href="/dashboard#bookmarks">กลับไปเลือกรายการ</Link></section> : (
        <div className="comparison-table-wrap">
          <table className="comparison-table">
            <thead><tr><th scope="col">หัวข้อ</th>{tors.map((tor) => <th scope="col" key={tor._id}><Link href={`/tors/${tor._id}`}>{tor.title}</Link><small>{tor.agencyName}</small></th>)}</tr></thead>
            <tbody>
              <tr><th scope="row">งบประมาณ</th>{tors.map((tor) => <td key={tor._id}><BudgetCell budget={tor.budget} /></td>)}</tr>
              <tr><th scope="row">ระยะเวลาและกำหนดส่ง</th>{tors.map((tor) => <td key={tor._id}><DurationCell tor={tor} /></td>)}</tr>
              <tr><th scope="row">เทคโนโลยี</th>{tors.map((tor) => <td key={tor._id}><ListCell values={tor.technologies} /></td>)}</tr>
              <tr><th scope="row">คุณสมบัติผู้ยื่นข้อเสนอ</th>{tors.map((tor) => <td key={tor._id}><QualificationsCell qualifications={tor.qualifications} /></td>)}</tr>
              <tr><th scope="row">เกณฑ์การประเมิน</th>{tors.map((tor) => <td key={tor._id}><CriteriaCell criteria={tor.evaluationCriteria} /></td>)}</tr>
              <tr><th scope="row">สิ่งที่ต้องส่งมอบ</th>{tors.map((tor) => <td key={tor._id}><ListCell values={tor.deliverables} /></td>)}</tr>
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
