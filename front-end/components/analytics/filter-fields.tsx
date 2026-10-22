"use client";

import { formatBuddhistYear, PROJECT_TYPE_LABEL, yearOptions } from "@/lib/analytics-format";

export function ProjectTypeField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <label className="analytics-field">
      <span>ประเภทโครงการ</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">ทุกประเภท</option>
        {Object.entries(PROJECT_TYPE_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </label>
  );
}

type YearRange = { yearFrom: string; yearTo: string };

/** Keeps the range ordered: moving one end past the other drags the other end along. */
export function YearRangeFields({ yearFrom, yearTo, onChange }: YearRange & { onChange: (next: YearRange) => void }) {
  const years = yearOptions();
  return (
    <>
      <label className="analytics-field">
        <span>ตั้งแต่ปี</span>
        <select value={yearFrom} onChange={(event) => {
          const next = event.target.value;
          onChange({ yearFrom: next, yearTo: next && yearTo && Number(next) > Number(yearTo) ? next : yearTo });
        }}>
          <option value="">ทุกปี</option>
          {years.map((year) => <option key={year} value={year}>{formatBuddhistYear(year)}</option>)}
        </select>
      </label>
      <label className="analytics-field">
        <span>ถึงปี</span>
        <select value={yearTo} onChange={(event) => {
          const next = event.target.value;
          onChange({ yearFrom: next && yearFrom && Number(next) < Number(yearFrom) ? next : yearFrom, yearTo: next });
        }}>
          <option value="">ทุกปี</option>
          {years.map((year) => <option key={year} value={year}>{formatBuddhistYear(year)}</option>)}
        </select>
      </label>
    </>
  );
}
