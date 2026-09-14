"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bookmark,
  Building2,
  CalendarDays,
  Download,
  FileText,
  MapPin,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { torRecords, TorRecord, TorStatus } from "@/data/mock-tors";

const statuses: Array<"All" | TorStatus> = ["All", "Open", "Draft", "Awarded", "In Progress"];
const categories = ["All", ...Array.from(new Set(torRecords.map((tor) => tor.category)))];
const statusLabels: Record<"All" | TorStatus, string> = { All: "ทั้งหมด", Open: "เปิดรับ", Draft: "ร่าง", Awarded: "ประกาศผลแล้ว", "In Progress": "อยู่ระหว่างดำเนินการ" };

function formatBudget(value: number) {
  if (!value) return "รอระบุ";
  if (value >= 1000000000) return `${(value / 1000000000).toFixed(2)}B THB`;
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M THB`;
  return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(value);
}

function statusClass(status: TorStatus) {
  return status.toLowerCase().replaceAll(" ", "-");
}

function buildSearchText(tor: TorRecord) {
  return [
    tor.id,
    tor.title,
    tor.type,
    tor.department,
    tor.bureau,
    tor.method,
    tor.district,
    tor.subdistrict,
    tor.status,
    tor.category,
    tor.tags.join(" "),
    tor.contractWinner ?? "",
  ].join(" ").toLowerCase();
}

export function BrowseTorsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState<"All" | TorStatus>("All");
  const [category, setCategory] = useState("All");

  const filteredTors = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return torRecords.filter((tor) => {
      const matchesQuery = normalizedQuery ? buildSearchText(tor).includes(normalizedQuery) : true;
      const matchesStatus = status === "All" ? true : tor.status === status;
      const matchesCategory = category === "All" ? true : tor.category === category;
      return matchesQuery && matchesStatus && matchesCategory;
    });
  }, [category, query, status]);

  const totalBudget = filteredTors.reduce((sum, tor) => sum + tor.budget, 0);
  const openCount = filteredTors.filter((tor) => tor.status === "Open" || tor.status === "Draft").length;

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
          <p>ค้นหาข้อมูลจัดซื้อจัดจ้างตัวอย่าง ทั้งหน่วยงาน เขต งบประมาณ สถานะ และแท็กการจัดหมวดหมู่ด้วย AI</p>
        </div>
        <form className="browse-search" onSubmit={onSubmit}>
          <Search size={22} />
          <input
            aria-label="ค้นหา TOR ทั้งหมด"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาด้วยชื่อโครงการ หน่วยงาน เขต หมวดหมู่ หรือผู้ขาย..."
          />
          <button className="button button--orange" type="submit">ค้นหา</button>
        </form>
      </section>

      <section className="browse-content">
        <aside className="browse-filters" aria-label="ตัวกรอง TOR">
          <div className="filter-title"><SlidersHorizontal size={17} />ตัวกรอง</div>
          <label>
            สถานะ
            <select value={status} onChange={(event) => setStatus(event.target.value as "All" | TorStatus)}>
              {statuses.map((option) => <option key={option}>{statusLabels[option]}</option>)}
            </select>
          </label>
          <label>
            หมวดหมู่จาก AI
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {categories.map((option) => <option key={option}>{option}</option>)}
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
            <small>โอกาสที่เปิดรับหรืออยู่ระหว่างร่าง</small>
          </div>
        </aside>

        <div className="browse-results">
          <div className="results-header">
            <div>
              <h2>รายการ TOR ทั้งหมด</h2>
              <p>{query.trim() ? `ผลการค้นหาสำหรับ “${query.trim()}”` : "แสดงรายการ TOR ตัวอย่างทั้งหมด"}</p>
            </div>
            <button className="icon-command" type="button" aria-label="ดาวน์โหลดไฟล์ CSV ตัวอย่าง" title="ดาวน์โหลดไฟล์ CSV ตัวอย่าง">
              <Download size={18} />
            </button>
          </div>

          {filteredTors.length > 0 ? (
            <div className="tor-list">
              {filteredTors.map((tor) => (
                <article className="tor-card" key={tor.id}>
                  <div className="tor-card__header">
                    <div>
                      <span className="tor-category">{tor.category}</span>
                      <h3>{tor.title}</h3>
                    </div>
                    <span className={`tor-status tor-status--${statusClass(tor.status)}`}>{statusLabels[tor.status]}</span>
                  </div>
                  <div className="tor-meta-grid">
                    <span><FileText size={15} />{tor.id}</span>
                    <span><Building2 size={15} />{tor.bureau}</span>
                    <span><MapPin size={15} />{tor.district}, {tor.subdistrict}</span>
                    <span><CalendarDays size={15} />ประกาศเมื่อ {tor.announceDate}</span>
                  </div>
                  <div className="tor-tags">
                    {tor.tags.map((tag) => <span key={tag}>{tag}</span>)}
                  </div>
                  <div className="tor-footer">
                    <div>
                      <small>งบประมาณโดยประมาณ</small>
                      <strong>{formatBudget(tor.budget)}</strong>
                    </div>
                    <div>
                      <small>ราคาที่ตกลง</small>
                      <strong>{formatBudget(tor.agreedPrice)}</strong>
                    </div>
                    <button className="icon-command" type="button" aria-label={`บันทึก ${tor.id}`} title="บันทึก TOR">
                      <Bookmark size={17} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Search size={28} />
              <h3>ไม่พบ TOR</h3>
              <p>ลองเปลี่ยนคำค้นหา สถานะ หรือหมวดหมู่จาก AI</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
