"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Info } from "lucide-react";
import { AccountShell } from "@/components/account-shell";
import { AccountMenu } from "@/components/account-menu";
import { useAuth } from "@/components/auth-provider";
import { AnalyticsTabs } from "@/components/analytics/analytics-tabs";
import { ProjectTypeField, YearRangeFields } from "@/components/analytics/filter-fields";
import { Agency, getAgencies } from "@/lib/agencies-api";
import { AnalyticsQuery, BudgetComparison, getBudgetComparison } from "@/lib/analytics-api";
import { bandLabel, formatBuddhistYear, formatCount, formatThb, formatThbCompact, formatThbRange, PROJECT_TYPE_LABEL } from "@/lib/analytics-format";

const STAT_LABELS: [keyof NonNullable<BudgetComparison["summary"]>, string][] = [
  ["minThb", "ต่ำสุด"],
  ["q1Thb", "ควอร์ไทล์ที่ 1 (Q1)"],
  ["medianThb", "ค่ากลาง (มัธยฐาน)"],
  ["q3Thb", "ควอร์ไทล์ที่ 3 (Q3)"],
  ["maxThb", "สูงสุด"],
  ["meanThb", "ค่าเฉลี่ย"],
];

/** The selection spelled out, so a figure is never read without knowing what set it came from. */
function describeSelection(result: BudgetComparison) {
  const { agencyName, projectType, yearFrom, yearTo } = result.filters;
  const period = yearFrom && yearTo && yearFrom !== yearTo ? `${formatBuddhistYear(yearFrom)} – ${formatBuddhistYear(yearTo)}`
    : yearFrom && yearTo ? formatBuddhistYear(yearFrom)
    : yearFrom ? `ตั้งแต่ ${formatBuddhistYear(yearFrom)}`
    : yearTo ? `ถึง ${formatBuddhistYear(yearTo)}`
    : "ทุกช่วงเวลา";
  return [agencyName ?? "ทุกหน่วยงาน", projectType ? PROJECT_TYPE_LABEL[projectType] ?? projectType : "ทุกประเภทโครงการ", period].join(" · ");
}

export function BudgetsClient() {
  const { token } = useAuth();
  const searchParams = useSearchParams();
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [filters, setFilters] = useState<Required<AnalyticsQuery>>({
    agencyId: searchParams.get("agencyId") ?? "",
    projectType: searchParams.get("projectType") ?? "",
    yearFrom: searchParams.get("yearFrom") ?? "",
    yearTo: searchParams.get("yearTo") ?? "",
  });
  const [result, setResult] = useState<BudgetComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAgencies().then(setAgencies).catch(() => setAgencies([]));
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getBudgetComparison(filters, token)
      .then((next) => { if (!cancelled) setResult(next); })
      .catch((err) => { if (!cancelled) { setResult(null); setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filters, token]);

  const maxBandCount = Math.max(1, ...(result?.distribution ?? []).map((band) => band.count));
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <AccountShell>
      <header className="account-header">
        <div>
          <h1>เปรียบเทียบงบประมาณย้อนหลัง</h1>
          <p>ดูงบประมาณของโครงการที่คล้ายกัน (หน่วยงาน ประเภทโครงการ และช่วงเวลาเดียวกัน) เพื่อกำหนดราคาเสนอจากหลักฐาน</p>
        </div>
        <div className="profile-actions"><AccountMenu compact /></div>
      </header>

      <AnalyticsTabs active="budgets" />

      <section className="panel analytics-filters" aria-label="ตัวเลือกชุดโครงการที่เปรียบเทียบ">
        <label className="analytics-field analytics-field--wide">
          <span>หน่วยงาน</span>
          <select value={filters.agencyId} onChange={(event) => setFilters({ ...filters, agencyId: event.target.value })}>
            <option value="">ทุกหน่วยงาน</option>
            {agencies.map((agency) => <option key={agency._id} value={agency._id}>{agency.name}</option>)}
          </select>
        </label>
        <ProjectTypeField value={filters.projectType} onChange={(projectType) => setFilters({ ...filters, projectType })} />
        <YearRangeFields yearFrom={filters.yearFrom} yearTo={filters.yearTo} onChange={(range) => setFilters({ ...filters, ...range })} />
        {hasFilters && <button type="button" className="analytics-reset" onClick={() => setFilters({ agencyId: "", projectType: "", yearFrom: "", yearTo: "" })}>ล้างตัวเลือก</button>}
      </section>

      <p className="analytics-basis"><Info size={14} />ตัวเลขทั้งหมดเป็นจำนวนเงินตามที่ประกาศ (nominal) ไม่ปรับตามเงินเฟ้อ และไม่ปรับฐานภาษีมูลค่าเพิ่ม · นับเฉพาะ TOR ที่ผ่านการตรวจสอบแล้ว</p>

      {error && <p className="key-dates-empty" role="alert">{error}</p>}
      {!error && !result && loading && <p className="key-dates-empty">กำลังคำนวณ...</p>}

      {result && (
        <div className={loading ? "analytics-loading" : undefined} aria-busy={loading}>
          <p className="analytics-selection">ชุดที่เปรียบเทียบ: <strong>{describeSelection(result)}</strong></p>

          <section className="metrics-grid">
            <article>
              <small>จำนวนโครงการที่ใช้คำนวณ</small>
              <strong className="blue">{formatCount(result.recordCount)} โครงการ</strong>
              <p>
                {result.excludedNoBudget > 0 ? `ไม่นับ ${formatCount(result.excludedNoBudget)} โครงการที่ไม่ระบุงบประมาณ` : "ทุกโครงการในชุดนี้ระบุงบประมาณ"}
                {result.undatedRecordCount > 0 && ` · ${formatCount(result.undatedRecordCount)} โครงการไม่มีวันที่ประกาศ`}
              </p>
            </article>
            <article>
              <small>ค่ากลาง (มัธยฐาน)</small>
              {result.summary
                ? <><strong className="orange">{formatThbCompact(result.summary.medianThb)}</strong><p>{formatThb(result.summary.medianThb)} · จาก {formatCount(result.recordCount)} โครงการ</p></>
                : <><strong><span className="analytics-insufficient">ข้อมูลไม่เพียงพอ</span></strong><p>มี {formatCount(result.recordCount)} โครงการ แต่ต้องมีอย่างน้อย {result.minComparableN} โครงการ</p></>}
            </article>
            <article>
              <small>ช่วงงบประมาณทั่วไป (Q1 – Q3)</small>
              {result.summary
                ? <><strong className="green">{formatThbRange(result.summary.q1Thb, result.summary.q3Thb)}</strong><p>ครึ่งหนึ่งของโครงการอยู่ในช่วงนี้ · จาก {formatCount(result.recordCount)} โครงการ</p></>
                : <><strong><span className="analytics-insufficient">ข้อมูลไม่เพียงพอ</span></strong><p>ไม่แสดงตัวเลขเมื่อโครงการน้อยกว่า {result.minComparableN} รายการ</p></>}
            </article>
          </section>

          {!result.sufficient && (
            <section className="panel analytics-notice">
              <h2>{result.recordCount === 0 ? "ไม่พบโครงการที่ตรงกับตัวเลือกนี้" : "ข้อมูลไม่เพียงพอสำหรับการเปรียบเทียบ"}</h2>
              <p>
                {result.recordCount === 0
                  ? "ลองขยายช่วงปี หรือเลือกทุกประเภทโครงการ / ทุกหน่วยงาน"
                  : `พบ ${formatCount(result.recordCount)} โครงการที่ระบุงบประมาณ ซึ่งต่ำกว่าเกณฑ์ขั้นต่ำ ${result.minComparableN} โครงการ จึงไม่แสดงตัวเลขเพื่อไม่ให้สรุปจากตัวอย่างที่น้อยเกินไป ลองขยายช่วงปีหรือเลือกทุกประเภทโครงการ`}
              </p>
            </section>
          )}

          {result.distribution && result.summary && (
            <>
              <section className="panel analytics-section">
                <div className="panel-title"><h2>การกระจายของงบประมาณ</h2><span>{formatCount(result.recordCount)} โครงการ</span></div>
                <ol className="analytics-bands">
                  {result.distribution.map((band) => (
                    <li key={band.fromThb} className="analytics-band">
                      <span className="analytics-band__label">{bandLabel(band)}</span>
                      <span className="analytics-bar" aria-hidden="true"><i style={{ width: `${(band.count / maxBandCount) * 100}%` }} /></span>
                      <span className="analytics-band__value"><strong>{formatCount(band.count)}</strong> <small>({Math.round((band.count / result.recordCount) * 100)}%)</small></span>
                    </li>
                  ))}
                </ol>
                <dl className="analytics-stats">
                  {STAT_LABELS.map(([key, label]) => (
                    <div key={key}><dt>{label}</dt><dd>{formatThbCompact(result.summary![key])}</dd></div>
                  ))}
                </dl>
              </section>

              {result.byYear.length > 0 && (
                <section className="panel analytics-section">
                  <div className="panel-title"><h2>แนวโน้มรายปี</h2><span>ปีที่ประกาศ</span></div>
                  <div className="analytics-table-wrap">
                    <table className="analytics-table">
                      <thead><tr><th scope="col">ปี</th><th scope="col" className="num">จำนวนโครงการ</th><th scope="col" className="num">ค่ากลาง (มัธยฐาน)</th></tr></thead>
                      <tbody>
                        {result.byYear.map((row) => (
                          <tr key={row.year}>
                            <th scope="row">{formatBuddhistYear(row.year)}</th>
                            <td className="num">{formatCount(row.recordCount)}</td>
                            <td className="num">{row.medianThb !== null ? formatThbCompact(row.medianThb) : <span className="analytics-insufficient">ข้อมูลไม่เพียงพอ</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </AccountShell>
  );
}
