/**
 * Date parsing for Thai government procurement listings.
 *
 * Every source here publishes in Buddhist Era (พ.ศ.), which runs 543 years
 * ahead of CE. "18 สิงหาคม 2569" is 2026-08-18, not a date 543 years in the
 * future — getting this wrong makes every freshness check and every deadline
 * calculation silently useless rather than obviously broken.
 *
 * Three formats appear across the six sources, and all three are needed:
 *
 *   "18 สิงหาคม 2569"  Thai month, 4-digit BE   (MOL, ITD, MOC)
 *   "14 ส.ค. 2026"     Thai abbrev, 4-digit CE  (DEPA — already converted)
 *   "27 Jul 69"        English abbrev, 2-digit BE (DGA — every row)
 *
 * The last one is easy to miss: DGA renders *all* of its announcement dates
 * that way, so a parser that only speaks Thai returns null for the entire
 * source, and a source with no dates cannot be freshness-checked at all.
 */

import type { CommentWindow, CommentWindowStatus } from '../types';

const THAI_MONTHS: Record<string, number> = {
  มกราคม: 1, กุมภาพันธ์: 2, มีนาคม: 3, เมษายน: 4,
  พฤษภาคม: 5, มิถุนายน: 6, กรกฎาคม: 7, สิงหาคม: 8,
  กันยายน: 9, ตุลาคม: 10, พฤศจิกายน: 11, ธันวาคม: 12,
};

/** Abbreviated Thai, used by some CMS themes (e.g. "18 ส.ค. 2569"). */
const THAI_MONTHS_ABBR: Record<string, number> = {
  'ม.ค.': 1, 'ก.พ.': 2, 'มี.ค.': 3, 'เม.ย.': 4,
  'พ.ค.': 5, 'มิ.ย.': 6, 'ก.ค.': 7, 'ส.ค.': 8,
  'ก.ย.': 9, 'ต.ค.': 10, 'พ.ย.': 11, 'ธ.ค.': 12,
};

/** English names — DGA and a handful of DEPA rows publish in English. */
const ENGLISH_MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Resolve any of the three vocabularies to a month number. */
function monthNumber(name: string): number | undefined {
  if (THAI_MONTHS[name]) return THAI_MONTHS[name];
  if (THAI_MONTHS_ABBR[name]) return THAI_MONTHS_ABBR[name];
  return ENGLISH_MONTHS[name.toLowerCase().replace(/\.$/, '')];
}

/**
 * Longest name first, so the alternation cannot match "sep" inside
 * "september" and leave "tember" stranded in front of the year.
 */
const MONTH_ALTERNATION = [
  ...Object.keys(THAI_MONTHS),
  ...Object.keys(THAI_MONTHS_ABBR),
  ...Object.keys(ENGLISH_MONTHS),
]
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join('|');

/** "18 สิงหาคม 2569", "14 ส.ค. 2026", "27 Jul 69". */
const LONG_DATE = new RegExp(
  String.raw`(\d{1,2})\s+(${MONTH_ALTERNATION})\.?\s+(\d{2,4})`,
  'i'
);
/** Anchored variant, for splitting a date off the FRONT of a packed string. */
const LONG_DATE_LEADING = new RegExp(
  String.raw`^\s*(\d{1,2}\s+(?:${MONTH_ALTERNATION})\.?\s+\d{2,4})\s*`,
  'i'
);
/** "18/08/2569" or "18-08-2569". */
const NUMERIC_DATE = /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/;
/** ISO-ish "2569-08-18" or a real ISO "2026-08-18T00:00:00". */
const ISO_DATE = /(\d{4})-(\d{1,2})-(\d{1,2})/;

const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';

/** Normalise Thai numerals (๒๕๖๙) to ASCII so one regex set covers both. */
export function normalizeThaiDigits(text: string): string {
  return (text ?? '').replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)));
}

/**
 * Widest CE year this domain can plausibly produce. Used to reject a parse
 * rather than record an absurd date — a date 500 years out would sail through
 * every downstream check and quietly poison the freshness signal.
 */
const MIN_PLAUSIBLE_YEAR = 1990;
const MAX_PLAUSIBLE_YEAR = new Date().getUTCFullYear() + 10;

/**
 * Convert a published year to CE.
 *
 * - 4-digit and >= 2400: Buddhist Era, so subtract 543.
 * - 4-digit and < 2400: already CE (DEPA publishes some rows this way).
 * - 2-digit: a short Buddhist Era year, so 69 -> 2569 -> 2026. This is DGA's
 *   format. Reading it as a short CE year instead would give 2069, and
 *   reading it as 1969 would be worse; the BE reading is the only one that
 *   lands in a sane range, which the caller then verifies.
 */
export function beToCe(year: number): number {
  if (year < 100) return 2500 + year - 543;
  return year >= 2400 ? year - 543 : year;
}

/** Build a UTC date, or null when the components don't form a real date. */
function utcDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < MIN_PLAUSIBLE_YEAR || year > MAX_PLAUSIBLE_YEAR) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  // Rejects overflow like 31 February, which Date otherwise rolls forward.
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d;
}

/**
 * Parse the first date found anywhere in `text`. Returns null when there
 * isn't one — callers must treat that as "unknown", never as "today".
 */
export function parseThaiDate(text: string | null | undefined): Date | null {
  const raw = normalizeThaiDigits(text ?? '').trim();
  if (!raw) return null;

  const long = LONG_DATE.exec(raw);
  if (long) {
    const month = monthNumber(long[2]);
    if (month) {
      const parsed = utcDate(beToCe(Number(long[3])), month, Number(long[1]));
      if (parsed) return parsed;
    }
  }

  const iso = ISO_DATE.exec(raw);
  if (iso) {
    const parsed = utcDate(beToCe(Number(iso[1])), Number(iso[2]), Number(iso[3]));
    if (parsed) return parsed;
  }

  const numeric = NUMERIC_DATE.exec(raw);
  if (numeric) {
    const parsed = utcDate(beToCe(Number(numeric[3])), Number(numeric[2]), Number(numeric[1]));
    if (parsed) return parsed;
  }

  return null;
}

/**
 * Split a leading date off a packed string.
 *
 * ITD packs date + doc type + title into one anchor with no separators, so
 * the date has to come off the front before anything else can be read.
 */
export function splitLeadingThaiDate(raw: string): { dateText: string; rest: string } {
  const normalized = normalizeThaiDigits(raw ?? '');
  const match = LONG_DATE_LEADING.exec(normalized);
  if (!match) return { dateText: '', rest: normalized.trim() };
  return { dateText: match[1].trim(), rest: normalized.slice(match[0].length).trim() };
}

/**
 * Same-month range: "ระหว่างวันที่ 19 - 24 ส.ค. 2569" — both ends share the
 * month and year, which are written once at the end.
 */
const RANGE_SAME_MONTH = new RegExp(
  String.raw`(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*(${MONTH_ALTERNATION})\.?\s*(\d{2,4})`,
  'i'
);
/** Cross-month range: "28 ส.ค. - 3 ก.ย. 2569" — the year is written once. */
const RANGE_CROSS_MONTH = new RegExp(
  String.raw`(\d{1,2})\s*(${MONTH_ALTERNATION})\.?\s*[-–—]\s*(\d{1,2})\s*(${MONTH_ALTERNATION})\.?\s*(\d{2,4})`,
  'i'
);

/**
 * Pull a date range out of prose.
 *
 * MOC states its public-comment window inside the announcement title rather
 * than in a field of its own ("...ระหว่างวันที่ 19 - 24 ส.ค. 2569"), so the
 * only way to know whether a vendor can still comment is to read it out of the
 * sentence. Returns null unless both ends parse — a half-read range is worse
 * than none, because it would make a closed window look open-ended.
 */
export function parseThaiDateRange(
  text: string | null | undefined
): { start: Date; end: Date } | null {
  const raw = normalizeThaiDigits(text ?? '');
  if (!raw) return null;

  // Cross-month is tried first: its pattern is strictly more specific, and a
  // same-month match would otherwise consume the leading day and month.
  const cross = RANGE_CROSS_MONTH.exec(raw);
  if (cross) {
    const [, d1, m1, d2, m2, year] = cross;
    const startMonth = monthNumber(m1);
    const endMonth = monthNumber(m2);
    if (startMonth && endMonth) {
      const ce = beToCe(Number(year));
      const end = utcDate(ce, endMonth, Number(d2));
      // A range that wraps the new year ("28 ธ.ค. - 3 ม.ค. 2569") states only
      // the end's year, so the start belongs to the year before.
      const start = utcDate(startMonth > endMonth ? ce - 1 : ce, startMonth, Number(d1));
      if (start && end && start <= end) return { start, end };
    }
  }

  const same = RANGE_SAME_MONTH.exec(raw);
  if (same) {
    const [, d1, d2, monthName, year] = same;
    const month = monthNumber(monthName);
    if (month) {
      const ce = beToCe(Number(year));
      const start = utcDate(ce, month, Number(d1));
      const end = utcDate(ce, month, Number(d2));
      if (start && end && start <= end) return { start, end };
    }
  }

  return null;
}

/** Strip the time-of-day so window comparisons are date-only, in UTC. */
function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Where today sits relative to a public-comment window.
 *
 * Only MOL publishes an explicit start+end window, and it is the most
 * actionable signal in the pipeline: it turns "no winner yet" into "can a
 * vendor still act on this today". Windows run 3-6 days, so this is only
 * meaningful if the source is polled daily.
 */
export function windowStatus(
  start: Date | null | undefined,
  end: Date | null | undefined,
  today: Date
): CommentWindowStatus {
  if (!start && !end) return 'unknown';
  const now = startOfUtcDay(today);
  if (start && now < startOfUtcDay(start)) return 'upcoming';
  if (end && now > startOfUtcDay(end)) return 'closed';
  return 'open';
}

/** Assemble a full comment window, computing its status against `today`. */
export function buildCommentWindow(
  start: Date | null,
  end: Date | null,
  today: Date
): CommentWindow {
  return { start, end, status: windowStatus(start, end, today) };
}

/**
 * Parse a Thai budget string ("1,500,000.00 บาท") into a number.
 * Returns null rather than 0 when nothing numeric is present, so a missing
 * budget is never mistaken for a free project.
 */
export function parseThaiCurrency(text: string | null | undefined): number | null {
  const raw = normalizeThaiDigits(text ?? '');
  const match = /(\d[\d,]*(?:\.\d+)?)/.exec(raw);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}
