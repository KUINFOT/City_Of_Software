"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, Bookmark, CalendarDays, ChevronLeft, ChevronRight, FolderOpen, List, Calendar as CalendarIcon } from "lucide-react";
import { AccountMenu } from "@/components/account-menu";
import { AccountShell } from "@/components/account-shell";
import { useAuth } from "@/components/auth-provider";
import { BookmarkedProject, listBookmarks } from "@/lib/bookmarks-api";
import { listAllTorDeadlines, TorDeadline } from "@/lib/tor-api";

type CalendarEvent = {
  id: string;
  title: string;
  agencyName: string;
  date: Date;
};

type CalendarView = "month" | "list";
type CalendarScope = "saved" | "all";

const WEEKDAYS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

function parseCalendarDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const datePart = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (datePart) {
    const [, year, month, day] = datePart;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day)
      ? date
      : null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDay(date: Date) {
  return new Intl.DateTimeFormat("th-TH", { day: "numeric" }).format(date);
}

function formatFullDate(date: Date) {
  return new Intl.DateTimeFormat("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDateValue(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function daysFromToday(date: Date) {
  const target = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const today = new Date();
  const current = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - current) / 86_400_000);
}

function daysLabel(date: Date) {
  const difference = daysFromToday(date);
  if (difference === 0) return "กำหนดส่งวันนี้";
  if (difference > 0) return `เหลือ ${difference} วัน`;
  return `เลยกำหนด ${Math.abs(difference)} วัน`;
}

/** A TOR that may carry a deadline, whichever API it came from. A TOR listed twice appears once. */
type DeadlineSource = { id: string; title: string; agencyName: string; deadline: string | null };

function getEvents(sources: DeadlineSource[]): CalendarEvent[] {
  const events = new Map<string, CalendarEvent>();
  for (const source of sources) {
    const date = parseCalendarDate(source.deadline);
    if (date && !events.has(source.id)) {
      events.set(source.id, { id: source.id, title: source.title, agencyName: source.agencyName, date });
    }
  }
  return [...events.values()].sort((first, second) => first.date.getTime() - second.date.getTime());
}

export default function CalendarPage() {
  const { token, ready } = useAuth();
  const [allTors, setAllTors] = useState<TorDeadline[]>([]);
  const [saved, setSaved] = useState<BookmarkedProject[]>([]);
  const [scope, setScope] = useState<CalendarScope>("saved");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getUTCFullYear(), today.getUTCMonth(), 1);
  });
  const [monthChosen, setMonthChosen] = useState(false);
  const [view, setView] = useState<CalendarView>("month");

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    Promise.all([
      // Past deadlines included: the calendar's "all projects" filter shows them, and the
      // public TOR list would hide them.
      listAllTorDeadlines(),
      // Saved TORs are a vendor feature: a failure here must not blank the calendar.
      token ? listBookmarks(token).catch(() => [] as BookmarkedProject[]) : Promise.resolve([] as BookmarkedProject[]),
    ])
      .then(([allResult, savedResult]) => {
        if (cancelled) return;
        setAllTors(allResult);
        setSaved(savedResult);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "โหลดกำหนดการไม่สำเร็จ");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ready, token]);

  const savedSources = useMemo<DeadlineSource[]>(
    () => saved.map((project) => ({ id: project.torId, title: project.title, agencyName: project.agencyName, deadline: project.deadline })),
    [saved]
  );
  const events = useMemo(() => {
    if (scope === "saved") return getEvents(savedSources);
    const allSources = allTors.map((tor) => ({ id: tor._id, title: tor.title, agencyName: tor.agencyName, deadline: tor.submissionDeadline }));
    return getEvents([...allSources, ...savedSources]);
  }, [scope, allTors, savedSources]);

  // Opening on an empty month hides every project, so until the vendor picks a
  // month, land on the nearest one that has a deadline (upcoming first, else the latest).
  useEffect(() => {
    if (loading || monthChosen || events.length === 0) return;
    const today = new Date();
    if (events.some((event) => event.date.getFullYear() === month.getFullYear() && event.date.getMonth() === month.getMonth())) return;
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const target = events.find((event) => event.date >= startOfToday) ?? events[events.length - 1];
    setMonth(new Date(target.date.getFullYear(), target.date.getMonth(), 1));
  }, [loading, monthChosen, events, month]);
  const monthEvents = useMemo(
    () => events.filter((event) => event.date.getFullYear() === month.getFullYear() && event.date.getMonth() === month.getMonth()),
    [events, month]
  );
  const calendarDays = useMemo(() => {
    const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(month.getFullYear(), month.getMonth(), 1 - firstDay.getDay());
    return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  }, [month]);
  const monthLabel = new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric" }).format(month);

  function changeMonth(offset: number) {
    setMonthChosen(true);
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  function showToday() {
    setMonthChosen(true);
    const today = new Date();
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  }

  // Switching the filter starts again from today's month.
  function changeScope(next: CalendarScope) {
    setScope(next);
    showToday();
  }

  return (
    <AccountShell>
      <header className="account-header calendar-page-header">
        <div>
          <h1>ปฏิทินโครงการ</h1>
          <p>ติดตามกำหนดส่งข้อเสนอของโครงการจัดซื้อจัดจ้าง</p>
        </div>
        <div className="profile-actions">
          <button type="button" aria-label="การแจ้งเตือน"><Bell size={18} /></button>
          <AccountMenu compact />
        </div>
      </header>

      <section className="calendar-page" aria-label="ปฏิทินกำหนดส่งโครงการ">
        <div className="calendar-toolbar">
          <div className="calendar-month-navigation">
            <h2>{monthLabel}</h2>
            <button type="button" aria-label="เดือนก่อนหน้า" onClick={() => changeMonth(-1)}><ChevronLeft size={18} /></button>
            <button type="button" aria-label="เดือนถัดไป" onClick={() => changeMonth(1)}><ChevronRight size={18} /></button>
            <button className="calendar-today-button" type="button" onClick={showToday}>วันนี้</button>
          </div>
          <div className="calendar-toolbar-controls">
            <div className="calendar-view-tabs" role="group" aria-label="โครงการที่แสดง">
              <button
                type="button"
                aria-pressed={scope === "saved"}
                className={scope === "saved" ? "active" : ""}
                onClick={() => changeScope("saved")}
              >
                <Bookmark size={16} /> โครงการที่บันทึกไว้
              </button>
              <button
                type="button"
                aria-pressed={scope === "all"}
                className={scope === "all" ? "active" : ""}
                title="รวมโครงการที่เลยกำหนดส่งแล้วและที่ยังไม่ถึงกำหนด"
                onClick={() => changeScope("all")}
              >
                <FolderOpen size={16} /> โครงการทั้งหมด
              </button>
            </div>
            <div className="calendar-view-tabs" role="tablist" aria-label="รูปแบบการแสดงผล">
              <button
                type="button"
                role="tab"
                aria-selected={view === "month"}
                className={view === "month" ? "active" : ""}
                onClick={() => setView("month")}
              >
                <CalendarIcon size={16} /> เดือน
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "list"}
                className={view === "list" ? "active" : ""}
                onClick={() => setView("list")}
              >
                <List size={16} /> รายการ
              </button>
            </div>
          </div>
        </div>

        <div className="calendar-legend">
          <span><i /> กำหนดส่งข้อเสนอ</span>
          <p>{monthEvents.length} กำหนดการในเดือนนี้</p>
        </div>

        {error ? (
          <div className="calendar-state calendar-state--error" role="alert">
            <CalendarDays size={24} />
            <strong>ไม่สามารถโหลดกำหนดการได้</strong>
            <p>{error}</p>
          </div>
        ) : loading ? (
          <div className="calendar-state" role="status">กำลังโหลดกำหนดการ…</div>
        ) : view === "month" ? (
          <div className="calendar-month-grid" role="tabpanel">
            <div className="calendar-weekdays">
              {WEEKDAYS.map((weekday) => <div key={weekday}>{weekday}</div>)}
            </div>
            <div className="calendar-days">
              {calendarDays.map((date) => {
                const dayEvents = events.filter((event) => event.date.getFullYear() === date.getFullYear()
                  && event.date.getMonth() === date.getMonth()
                  && event.date.getDate() === date.getDate());
                const inCurrentMonth = date.getMonth() === month.getMonth();
                const today = daysFromToday(date) === 0;
                return (
                  <div
                    key={`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`}
                    className={`calendar-day${inCurrentMonth ? "" : " calendar-day--outside"}${today ? " calendar-day--today" : ""}`}
                  >
                    <span className="calendar-day-number">{formatDay(date)}</span>
                    <div className="calendar-day-events">
                      {dayEvents.slice(0, 3).map((event) => (
                        <Link key={event.id} href={`/tors/${event.id}`} title={`${event.title} · ${event.agencyName}`}>
                          {event.title}
                        </Link>
                      ))}
                      {dayEvents.length > 3 && <span className="calendar-more-events">อีก {dayEvents.length - 3} รายการ</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="calendar-event-list" role="tabpanel">
            <div className="calendar-list-heading">
              <strong>กำหนดส่งในเดือน{monthLabel}</strong>
              <span>{monthEvents.length} รายการ</span>
            </div>
            {monthEvents.length === 0 ? (
              <div className="calendar-empty">
                <CalendarDays size={26} />
                {scope === "saved" && events.length === 0 ? (
                  <>
                    <strong>ยังไม่มีโครงการที่บันทึกไว้ซึ่งมีกำหนดส่ง</strong>
                    <p>บันทึกโครงการจากหน้ารายละเอียด หรือเลือก “โครงการทั้งหมด” เพื่อดูทุกโครงการ</p>
                  </>
                ) : (
                  <>
                    <strong>ไม่มีโครงการที่มีกำหนดส่งในเดือนนี้</strong>
                    <p>ลองเลือกเดือนอื่น หรือตรวจสอบอีกครั้งภายหลัง</p>
                  </>
                )}
              </div>
            ) : monthEvents.map((event) => (
              <article className="calendar-event-row" key={event.id}>
                <time dateTime={formatDateValue(event.date)}>
                  <strong>{formatDay(event.date)}</strong>
                  <span>{new Intl.DateTimeFormat("th-TH", { month: "short" }).format(event.date)}</span>
                </time>
                <div className="calendar-event-context">
                  <Link href={`/tors/${event.id}`}>{event.title}</Link>
                  <span>{event.agencyName}</span>
                </div>
                <div className="calendar-event-meta">
                  <span className="calendar-deadline-badge">กำหนดส่งข้อเสนอ</span>
                  <span>{formatFullDate(event.date)}</span>
                </div>
                <span className={`calendar-event-countdown${daysFromToday(event.date) < 0 ? " overdue" : ""}`}>
                  {daysLabel(event.date)}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>
    </AccountShell>
  );
}