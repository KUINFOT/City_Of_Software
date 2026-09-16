"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Building2, CalendarDays, FileText, Search, SlidersHorizontal } from "lucide-react";
import { listTors, TorSummary } from "@/lib/tor-api";

const STAGE_LABEL: Record<string, string> = {
  plan: "อยู่ระหว่างวางแผน",
  draft_tor: "ร่าง TOR",
  spec: "อยู่ระหว่างจัดทำรายละเอียด",
  price_reference: "อยู่ระหว่างพิจารณาราคากลาง",
  bidding_open: "เปิดรับข้อเสนอ",
  awarded: "ประกาศผลแล้ว",
  cancelled: "ยกเลิก",
  other: "อยู่ระหว่างดำเนินการ",
};

const STAGE_STATUS_CLASS: Record<string, string> = {
  bidding_open: "tor-status--open",
  awarded: "tor-status--awarded",
  cancelled: "tor-status--cancelled",
  draft_tor: "tor-status--draft",
  plan: "tor-status--draft",
  spec: "tor-status--draft",
  price_reference: "tor-status--draft",
};

function formatBudget(amountThb: number | null | undefined) {
  if (!amountThb) return "ไม่ระบุ";
  if (amountThb >= 1000000000) return `${(amountThb / 1000000000).toFixed(2)} พันล้านบาท`;
  if (amountThb >= 1000000) return `${(amountThb / 1000000).toFixed(1)} ล้านบาท`;
  return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(amountThb);
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" }) : "ไม่ระบุ";
}

function buildSearchText(tor: TorSummary) {
  return [tor._id, tor.title, tor.agencyName].join(" ").toLowerCase();
}

export function BrowseTorsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [stage, setStage] = useState("All");
  const [tors, setTors] = useState<TorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listTors()
      .then((result) => { if (!cancelled) setTors(result); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const stages = useMemo(
    () => ["All", ...Array.from(new Set(tors.map((tor) => tor.lifecycle?.stage ?? "other")))],
    [tors]
  );

  const filteredTors = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return tors.filter((tor) => {
      const matchesQuery = normalizedQuery ? buildSearchText(tor).includes(normalizedQuery) : true;
      const matchesStage = stage === "All" ? true : (tor.lifecycle?.stage ?? "other") === stage;
      return matchesQuery && matchesStage;
    });
  }, [tors, query, stage]);

  const totalBudget = filteredTors.reduce((sum, tor) => sum + (tor.budget?.amountThb ?? 0), 0);
  const openCount = filteredTors.filter((tor) => (tor.lifecycle?.stage ?? "other") === "bidding_open").length;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = query.trim();
    router.replace(nextQuery ? `/browse-tors?q=${encodeURIComponent(nextQuery)}` : "/browse-tors");
  }

  return (
    <main className="browse-page">
      <section className="browse-hero">
        <div>
          <p className="browse-kicker">ฐานข้อมูลค้นหา TOR ของ กทม.</p>
          <h1>ค้นหา TOR และข้อมูลจัดซื้อจัดจ้างของ กทม.</h1>
          <p>ค้นหา TOR ที่ประกาศแล้วทั้งหมด ทั้งหน่วยงาน งบประมาณ และสถานะโครงการ</p>
        </div>
        <form className="browse-search" onSubmit={onSubmit}>
          <Search size={22} />
          <input
            aria-label="ค้นหา TOR ทั้งหมด"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาด้วยชื่อโครงการหรือหน่วยงาน..."
          />
          <button className="button button--orange" type="submit">ค้นหา</button>
        </form>
      </section>

      <section className="browse-content">
        <aside className="browse-filters" aria-label="ตัวกรอง TOR">
          <div className="filter-title"><SlidersHorizontal size={17} />ตัวกรอง</div>
          <label>
            สถานะ
            <select value={stage} onChange={(event) => setStage(event.target.value)}>
              {stages.map((option) => (
                <option key={option} value={option}>{option === "All" ? "ทั้งหมด" : STAGE_LABEL[option] ?? option}</option>
              ))}
            </select>
          </label>
          <div className="filter-summary">
            <span>{filteredTors.length}</span>
            <small>TOR ที่ตรงเงื่อนไข</small>
          </div>
          <div className="filter-summary">
            <span>{formatBudget(totalBudget)}</span>
            <small>งบประมาณโดยประมาณรวม</small>
          </div>
          <div className="filter-summary">
            <span>{openCount}</span>
            <small>เปิดรับข้อเสนออยู่ในขณะนี้</small>
          </div>
        </aside>

        <div className="browse-results">
          <div className="results-header">
            <div>
              <h2>รายการ TOR ทั้งหมด</h2>
              <p>{query.trim() ? `ผลการค้นหาสำหรับ “${query.trim()}”` : "แสดงรายการ TOR ที่ประกาศแล้วทั้งหมด"}</p>
            </div>
          </div>

          {loading ? (
            <div className="empty-state">
              <p>กำลังโหลดข้อมูล TOR...</p>
            </div>
          ) : error ? (
            <div className="empty-state">
              <p>{error}</p>
            </div>
          ) : filteredTors.length > 0 ? (
            <div className="tor-list">
              {filteredTors.map((tor) => (
                <Link className="tor-card" href={`/tors/${tor._id}`} key={tor._id}>
                  <div className="tor-card__header">
                    <div>
                      <h3>{tor.title}</h3>
                    </div>
                    <span className={`tor-status ${STAGE_STATUS_CLASS[tor.lifecycle?.stage ?? "other"] ?? "tor-status--in-progress"}`}>
                      {STAGE_LABEL[tor.lifecycle?.stage ?? "other"] ?? tor.lifecycle?.stage ?? "other"}
                    </span>
                  </div>
                  <div className="tor-meta-grid">
                    <span><FileText size={15} />{tor._id}</span>
                    <span><Building2 size={15} />{tor.agencyName}</span>
                    <span><CalendarDays size={15} />กำหนดส่งข้อเสนอ {formatDate(tor.timeline?.submissionDeadline)}</span>
                  </div>
                  <div className="tor-footer">
                    <div>
                      <small>งบประมาณโดยประมาณ</small>
                      <strong>{formatBudget(tor.budget?.amountThb)}</strong>
                    </div>
                    <div>
                      <small>ค้นพบเมื่อ</small>
                      <strong>{formatDate(tor.createdAt)}</strong>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Search size={28} />
              <h3>ไม่พบ TOR</h3>
              <p>ลองเปลี่ยนคำค้นหาหรือสถานะ</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
