"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Info } from "lucide-react";
import { AccountShell } from "@/components/account-shell";
import { AccountMenu } from "@/components/account-menu";
import { useAuth } from "@/components/auth-provider";
import { AnalyticsTabs } from "@/components/analytics/analytics-tabs";
import { ProjectTypeField, YearRangeFields } from "@/components/analytics/filter-fields";
import { AgencyFrequency, AgencyFrequencyReport, getAgencyFrequency, toQueryString } from "@/lib/analytics-api";
import { formatBuddhistYear, formatCount, formatRate, formatThbCompact, formatThbRange } from "@/lib/analytics-format";

type SortKey = "count" | "rate" | "size" | "name";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "count", label: "จำนวนโครงการ" },
  { key: "rate", label: "ความถี่ต่อปี" },
  { key: "size", label: "ขนาดโครงการทั่วไป" },
  { key: "name", label: "ชื่อหน่วยงาน" },
];

/** Descending by a figure that may be withheld; agencies without a figure sort last, not first. */
function byFigure(figure: (agency: AgencyFrequency) => number | null) {
  return (a: AgencyFrequency, b: AgencyFrequency) => (figure(b) ?? -1) - (figure(a) ?? -1);
}

const COMPARATORS: Record<SortKey, (a: AgencyFrequency, b: AgencyFrequency) => number> = {
  count: byFigure((agency) => agency.procurementCount),
  rate: byFigure((agency) => agency.procurementsPerYear),
  size: byFigure((agency) => agency.typicalBudgetThb),
  name: (a, b) => a.agencyName.localeCompare(b.agencyName, "th"),
};

function Insufficient({ have, need }: { have: number; need: number }) {
  return <span className="analytics-insufficient">ข้อมูลไม่เพียงพอ <small>({formatCount(have)}/{need})</small></span>;
}

export function AgenciesClient() {
  const { token } = useAuth();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState({
    projectType: searchParams.get("projectType") ?? "",
    yearFrom: searchParams.get("yearFrom") ?? "",
    yearTo: searchParams.get("yearTo") ?? "",
  });
  const [report, setReport] = useState<AgencyFrequencyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("count");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [onlySelected, setOnlySelected] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAgencyFrequency(filters, token)
      .then((next) => { if (!cancelled) setReport(next); })
      .catch((err) => { if (!cancelled) { setReport(null); setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filters, token]);

  const rows = useMemo(() => {
    if (!report) return [];
    const visible = onlySelected && selected.size > 0 ? report.agencies.filter((agency) => selected.has(agency.agencyId)) : report.agencies;
    return [...visible].sort(COMPARATORS[sort]);
  }, [report, sort, selected, onlySelected]);

  // Bars share one scale across every agency shown, so they can be compared by eye.
  const maxCount = Math.max(1, ...rows.map((agency) => agency.procurementCount));
  const maxSize = Math.max(1, ...rows.map((agency) => agency.typicalBudgetThb ?? 0));
  const hasFilters = Object.values(filters).some(Boolean);

  function toggle(agencyId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(agencyId)) next.delete(agencyId);
      else next.add(agencyId);
      return next;
    });
  }

  return (
    <AccountShell>
      <header className="account-header">
        <div>
          <h1>ความถี่การจัดซื้อรายหน่วยงาน</h1>
          <p>เปรียบเทียบว่าแต่ละหน่วยงานจัดซื้อซอฟต์แวร์บ่อยแค่ไหนและขนาดโครงการทั่วไปเท่าไร เพื่อตัดสินใจว่าควรเน้นหน่วยงานใด</p>
        </div>
        <div className="profile-actions"><AccountMenu compact /></div>
      </header>

      <AnalyticsTabs active="agencies" />

      <section className="panel analytics-filters" aria-label="ตัวเลือกการเปรียบเทียบหน่วยงาน">
        <ProjectTypeField value={filters.projectType} onChange={(projectType) => setFilters({ ...filters, projectType })} />
        <YearRangeFields yearFrom={filters.yearFrom} yearTo={filters.yearTo} onChange={(range) => setFilters({ ...filters, ...range })} />
        <label className="analytics-field">
          <span>เรียงตาม</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
            {SORTS.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        {hasFilters && <button type="button" className="analytics-reset" onClick={() => setFilters({ projectType: "", yearFrom: "", yearTo: "" })}>ล้างตัวเลือก</button>}
      </section>

      <p className="analytics-basis">
        <Info size={14} />
        {report?.window
          ? `ความถี่คิดจากช่วง ${formatBuddhistYear(report.window.fromYear)} – ${formatBuddhistYear(report.window.toYear)} (${report.window.years} ปี) เท่ากันทุกหน่วยงาน เพื่อให้เปรียบเทียบกันได้ · `
          : ""}
        ขนาดโครงการเป็นจำนวนเงินตามที่ประกาศ (nominal) ไม่ปรับตามเงินเฟ้อ · นับเฉพาะ TOR ที่ผ่านการตรวจสอบแล้ว
      </p>

      {error && <p className="key-dates-empty" role="alert">{error}</p>}
      {!error && !report && loading && <p className="key-dates-empty">กำลังคำนวณ...</p>}

      {report && (
        <div className={loading ? "analytics-loading" : undefined} aria-busy={loading}>
          <section className="metrics-grid">
            <article><small>หน่วยงานที่พบ</small><strong className="blue">{formatCount(report.totals.agencyCount)} หน่วยงาน</strong><p>ตามตัวเลือกด้านบน</p></article>
            <article><small>โครงการที่นับ</small><strong className="orange">{formatCount(report.totals.procurementCount)} โครงการ</strong><p>เฉพาะที่มีวันที่ประกาศ</p></article>
            <article><small>ไม่นับเพราะไม่มีวันที่ประกาศ</small><strong className="green">{formatCount(report.totals.excludedNoDate)} โครงการ</strong><p>ไม่สามารถจัดเข้าปีใดได้</p></article>
          </section>

          <section className="panel analytics-section">
            <div className="panel-title">
              <h2>เปรียบเทียบหน่วยงาน</h2>
              <label className="analytics-check">
                <input type="checkbox" checked={onlySelected} disabled={selected.size === 0} onChange={(event) => setOnlySelected(event.target.checked)} />
                แสดงเฉพาะที่เลือก ({selected.size})
              </label>
            </div>

            {rows.length === 0 ? (
              <p className="key-dates-empty">ไม่พบหน่วยงานที่ตรงกับตัวเลือกนี้ — ลองขยายช่วงปีหรือเลือกทุกประเภทโครงการ</p>
            ) : (
              <div className="analytics-table-wrap">
                <table className="analytics-table analytics-table--agencies">
                  <thead>
                    <tr>
                      <th scope="col"><span className="sr-only">เลือกเพื่อเปรียบเทียบ</span></th>
                      <th scope="col">หน่วยงาน</th>
                      <th scope="col">จำนวนโครงการ</th>
                      <th scope="col" className="num">ต่อปี</th>
                      <th scope="col">ขนาดโครงการทั่วไป (มัธยฐาน)</th>
                      <th scope="col"><span className="sr-only">ดูรายละเอียด</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((agency) => {
                      const budgetLink = `/analytics/budgets${toQueryString({ agencyId: agency.agencyId, ...filters })}`;
                      return (
                        <tr key={agency.agencyId} className={selected.has(agency.agencyId) ? "selected" : undefined}>
                          <td><input type="checkbox" aria-label={`เลือก ${agency.agencyName}`} checked={selected.has(agency.agencyId)} onChange={() => toggle(agency.agencyId)} /></td>
                          <th scope="row">{agency.agencyName}</th>
                          <td>
                            <div className="analytics-meter">
                              <span className="analytics-bar" aria-hidden="true"><i style={{ width: `${(agency.procurementCount / maxCount) * 100}%` }} /></span>
                              <strong>{formatCount(agency.procurementCount)}</strong>
                            </div>
                            {agency.excludedNoDate > 0 && <small className="analytics-note">ไม่นับ {formatCount(agency.excludedNoDate)} ที่ไม่มีวันที่</small>}
                          </td>
                          <td className="num">
                            {agency.procurementsPerYear !== null
                              ? <><strong>{formatRate(agency.procurementsPerYear)}</strong><small className="analytics-note">ใน {agency.activeYears} ปีที่พบ</small></>
                              : <Insufficient have={agency.procurementCount} need={report.minComparableN} />}
                          </td>
                          <td>
                            {agency.typicalBudgetThb !== null && agency.q1Thb !== null && agency.q3Thb !== null ? (
                              <>
                                <div className="analytics-meter">
                                  <span className="analytics-bar analytics-bar--alt" aria-hidden="true"><i style={{ width: `${(agency.typicalBudgetThb / maxSize) * 100}%` }} /></span>
                                  <strong>{formatThbCompact(agency.typicalBudgetThb)}</strong>
                                </div>
                                <small className="analytics-note">
                                  ช่วงทั่วไป {formatThbRange(agency.q1Thb, agency.q3Thb)} · จาก {formatCount(agency.budgetedCount)} โครงการ
                                  {agency.excludedNoBudget > 0 && ` (ไม่นับ ${formatCount(agency.excludedNoBudget)} ที่ไม่ระบุงบ)`}
                                </small>
                              </>
                            ) : <Insufficient have={agency.budgetedCount} need={report.minComparableN} />}
                          </td>
                          <td><Link className="analytics-link" href={budgetLink}>ดูการกระจายงบ</Link></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </AccountShell>
  );
}
