import { CalendarClock } from "lucide-react";
import type { KeyDate, KeyDateKey } from "@/lib/tor-api";

const LABELS: Record<KeyDateKey, string> = {
  announcementDate: "วันประกาศ",
  commentPeriodStart: "เริ่มรับฟังความคิดเห็น",
  commentPeriodEnd: "สิ้นสุดรับฟังความคิดเห็น",
  clarificationMeetingDate: "วันชี้แจงรายละเอียด",
  submissionDeadline: "กำหนดส่งข้อเสนอ",
  contractStartDate: "วันเริ่มสัญญา",
  contractEndDate: "วันสิ้นสุดสัญญา",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
}

function remainingLabel(date: KeyDate) {
  if (date.daysRemaining === null) return "ยังไม่ระบุ";
  if (date.isPast) return `ผ่านไปแล้ว ${Math.abs(date.daysRemaining)} วัน`;
  if (date.daysRemaining === 0) return "วันนี้";
  return `เหลืออีก ${date.daysRemaining} วัน`;
}

export function KeyDatesPanel({ keyDates }: { keyDates: KeyDate[] }) {
  const withDates = keyDates.filter((d) => d.date);

  return (
    <article className="panel">
      <div className="panel-title">
        <h2>วันที่สำคัญ</h2>
      </div>
      {withDates.length === 0 ? (
        <p className="key-dates-empty">ยังไม่มีการระบุวันที่สำคัญสำหรับ TOR นี้</p>
      ) : (
        <div className="key-dates-list">
          {withDates.map((date) => (
            <div
              key={date.key}
              className={`key-date${date.isUrgent ? " key-date--urgent" : ""}${date.isPast ? " key-date--past" : ""}`}
            >
              <CalendarClock size={16} />
              <div>
                <strong>{LABELS[date.key]}</strong>
                <span>{formatDate(date.date!)}</span>
              </div>
              <span className="key-date__remaining">{remainingLabel(date)}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
