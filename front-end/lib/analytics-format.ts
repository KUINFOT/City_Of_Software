import type { BudgetBand } from "./analytics-api";

export const PROJECT_TYPE_LABEL: Record<string, string> = {
  web_application: "เว็บแอปพลิเคชัน",
  mobile_application: "แอปพลิเคชันมือถือ",
  it_system: "ระบบไอที",
  other: "อื่น ๆ",
};

/** Years offered in the filters, newest first. The API takes Gregorian years; the UI shows พ.ศ. */
export function yearOptions(now = new Date()): number[] {
  const current = now.getFullYear();
  return Array.from({ length: current - 2018 + 1 }, (_, i) => current - i);
}

export function formatBuddhistYear(year: number): string {
  return `พ.ศ. ${year + 543}`;
}

export function formatThb(value: number): string {
  return `฿ ${new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 }).format(value)}`;
}

export function formatThbCompact(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)} พันล้านบาท`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} ล้านบาท`;
  return formatThb(value);
}

/** "2.1 – 7.2 ล้านบาท" when both ends are in millions, instead of repeating the unit on each end. */
export function formatThbRange(low: number, high: number): string {
  if (low >= 1_000_000 && high >= 1_000_000 && high < 1_000_000_000) {
    return `${(low / 1_000_000).toFixed(1)} – ${(high / 1_000_000).toFixed(1)} ล้านบาท`;
  }
  return `${formatThbCompact(low)} – ${formatThbCompact(high)}`;
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("th-TH").format(value);
}

export function formatRate(value: number): string {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 1 }).format(value);
}

function shortAmount(value: number): string {
  return value >= 1_000_000 ? `${value / 1_000_000} ล้าน` : `${value / 100_000} แสน`;
}

export function bandLabel(band: Pick<BudgetBand, "fromThb" | "toThb">): string {
  if (band.toThb === null) return `${shortAmount(band.fromThb)}บาทขึ้นไป`;
  if (band.fromThb === 0) return `ต่ำกว่า ${shortAmount(band.toThb)}บาท`;
  return `${shortAmount(band.fromThb)} – ${shortAmount(band.toThb)}บาท`;
}
