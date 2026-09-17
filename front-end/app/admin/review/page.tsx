"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ClipboardCheck, Eye, Search } from "lucide-react";
import { AccountShell } from "@/components/account-shell";
import { useAuth } from "@/components/auth-provider";
import { listReviewQueue, ReviewQueueItem } from "@/lib/review-api";

const READY_THRESHOLD = 0.75;

function statusKind(item: ReviewQueueItem): "needs_review" | "duplicate_check" | "ready_to_publish" {
  if (item.duplicateStatus === "suspected") return "duplicate_check";
  if ((item.extraction?.overallConfidence ?? 0) >= READY_THRESHOLD) return "ready_to_publish";
  return "needs_review";
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" }) : "ไม่ระบุ";
}

export default function ReviewQueuePage() {
  const { token } = useAuth();
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    listReviewQueue(token)
      .then((result) => { if (!cancelled) setItems(result); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "ไม่สามารถโหลดคิวตรวจสอบได้"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) => `${item.title} ${item.agencyName}`.toLowerCase().includes(normalized));
  }, [items, query]);

  const summary = useMemo(() => ({
    total: items.length,
    duplicates: items.filter((item) => item.duplicateStatus === "suspected").length,
    ready: items.filter((item) => (item.extraction?.overallConfidence ?? 0) >= READY_THRESHOLD).length,
  }), [items]);

  return (
    <AccountShell allowedRoles={["admin"]}>
      <header className="account-header">
        <div>
          <p className="login-kicker">การตรวจสอบก่อนเผยแพร่</p>
          <h1>คิวตรวจสอบ TOR</h1>
          <p>รายการ TOR ที่ผ่านการแยกข้อมูลด้วย AI แล้ว รอผู้ดูแลตรวจสอบก่อนเผยแพร่จริง</p>
        </div>
      </header>

      <section className="adapter-summary" aria-label="สรุปคิวตรวจสอบ">
        <article><ClipboardCheck size={20} /><div><strong>{summary.total}</strong><span>รอตรวจสอบทั้งหมด</span></div></article>
        <article><AlertTriangle size={20} /><div><strong>{summary.duplicates}</strong><span>อาจซ้ำกับรายการอื่น</span></div></article>
        <article><Eye size={20} /><div><strong>{summary.ready}</strong><span>ความเชื่อมั่นสูง พร้อมพิจารณาอนุมัติ</span></div></article>
      </section>

      <section className="adapter-health__panel">
        <div className="review-toolbar">
          <div><h2>รายการรอตรวจสอบ</h2><p>ข้อมูลจริงจาก GET /api/review/queue เรียงตามลำดับที่ค้นพบก่อน</p></div>
          <div className="admin-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาชื่อโครงการหรือหน่วยงาน..." /></div>
        </div>

        {loading ? (
          <p className="key-dates-empty">กำลังโหลดคิวตรวจสอบ...</p>
        ) : error ? (
          <p className="key-dates-empty">{error}</p>
        ) : visibleItems.length === 0 ? (
          <p className="key-dates-empty">ไม่มีรายการรอตรวจสอบ</p>
        ) : (
          <div>
            {visibleItems.map((item) => {
              const kind = statusKind(item);
              const confidence = Math.round((item.extraction?.overallConfidence ?? 0) * 100);
              return (
                <article className="review-row" key={item._id}>
                  <div className={`review-row__status review-row__status--${kind}`} />
                  <div className="review-row__main">
                    <div className="review-row__title"><h2>{item.title}</h2><span>{item.agencyName}</span></div>
                    <p>กำหนดส่งข้อเสนอ {formatDate(item.timeline?.submissionDeadline)} · ค้นพบเมื่อ {formatDate(item.createdAt)}</p>
                    {item.duplicateStatus === "suspected" && (
                      <div className="duplicate-note"><AlertTriangle size={12} /> ระบบตรวจพบว่าอาจซ้ำกับรายการอื่น</div>
                    )}
                  </div>
                  <div className={`review-row__quality ${confidence >= READY_THRESHOLD * 100 ? "review-row__quality--verified" : ""}`}>
                    <strong>{confidence}%</strong>
                    <span>ความเชื่อมั่น</span>
                  </div>
                  <Link className="review-open" href={`/admin/review/${item._id}`}><Eye size={14} /> เปิดตรวจสอบ</Link>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </AccountShell>
  );
}
