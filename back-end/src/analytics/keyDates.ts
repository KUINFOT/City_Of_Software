/**
 * "Key dates with time remaining" (US-019/FR-REP-07: "Key dates shall be
 * shown with the number of days remaining, and any deadline within seven
 * days shall be visually emphasised.")
 *
 * Deliberately presentation-agnostic: no labels, no language, just the
 * dates a Tor actually carries plus the arithmetic a client would otherwise
 * have to duplicate on every page that shows one. Labelling (Thai/English)
 * is a frontend i18n concern and stays out of the API.
 */

/** Order matches roughly how these dates occur in a real procurement timeline. */
const KEY_DATE_KEYS = [
  'announcementDate',
  'commentPeriodStart',
  'commentPeriodEnd',
  'clarificationMeetingDate',
  'submissionDeadline',
  'contractStartDate',
  'contractEndDate',
] as const;

export type KeyDateKey = (typeof KEY_DATE_KEYS)[number];

export interface KeyDate {
  key: KeyDateKey;
  date: Date | null;
  /** Whole days from `today` to `date`, rounded up — negative once past. `null` when `date` is null. */
  daysRemaining: number | null;
  isPast: boolean;
  /** `0 <= daysRemaining <= urgentWithinDays` — FR-REP-07's "within seven days" rule. */
  isUrgent: boolean;
}

export type TorTimelineLike = Partial<Record<KeyDateKey, Date | null | undefined>>;

const DAY_MS = 86_400_000;

export function computeKeyDates(
  timeline: TorTimelineLike | null | undefined,
  today: Date,
  urgentWithinDays: number
): KeyDate[] {
  return KEY_DATE_KEYS.map((key) => {
    const raw = timeline?.[key];
    const date = raw instanceof Date && !Number.isNaN(raw.getTime()) ? raw : null;

    if (!date) {
      return { key, date: null, daysRemaining: null, isPast: false, isUrgent: false };
    }

    const daysRemaining = Math.ceil((date.getTime() - today.getTime()) / DAY_MS);
    const isPast = daysRemaining < 0;
    const isUrgent = !isPast && daysRemaining <= urgentWithinDays;

    return { key, date, daysRemaining, isPast, isUrgent };
  });
}
