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

function formatBudget(value: number) {
  if (!value) return "Pending";
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
          <p className="browse-kicker">BMA TOR SEARCH DATABASE</p>
          <h1>Browse all BMA TORs and procurement records</h1>
          <p>Search mock procurement data shaped from the sample CSV, including agency, district, budget, status, and AI classification tags.</p>
        </div>
        <form className="browse-search" onSubmit={onSubmit}>
          <Search size={22} />
          <input
            aria-label="Search all TORs"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by project name, agency, district, category, vendor..."
          />
          <button className="button button--orange" type="submit">Search</button>
        </form>
      </section>

      <section className="browse-content">
        <aside className="browse-filters" aria-label="TOR filters">
          <div className="filter-title"><SlidersHorizontal size={17} />Filters</div>
          <label>
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value as "All" | TorStatus)}>
              {statuses.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label>
            AI Category
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {categories.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <div className="filter-summary">
            <span>{filteredTors.length}</span>
            <small>matching TORs</small>
          </div>
          <div className="filter-summary">
            <span>{formatBudget(totalBudget)}</span>
            <small>combined estimated budget</small>
          </div>
          <div className="filter-summary">
            <span>{openCount}</span>
            <small>open or draft opportunities</small>
          </div>
        </aside>

        <div className="browse-results">
          <div className="results-header">
            <div>
              <h2>All TOR Records</h2>
              <p>{query.trim() ? `Showing results for "${query.trim()}"` : "Showing all mock TOR records"}</p>
            </div>
            <button className="icon-command" type="button" aria-label="Download mock CSV export" title="Download mock CSV export">
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
                    <span className={`tor-status tor-status--${statusClass(tor.status)}`}>{tor.status}</span>
                  </div>
                  <div className="tor-meta-grid">
                    <span><FileText size={15} />{tor.id}</span>
                    <span><Building2 size={15} />{tor.bureau}</span>
                    <span><MapPin size={15} />{tor.district}, {tor.subdistrict}</span>
                    <span><CalendarDays size={15} />Announced {tor.announceDate}</span>
                  </div>
                  <div className="tor-tags">
                    {tor.tags.map((tag) => <span key={tag}>{tag}</span>)}
                  </div>
                  <div className="tor-footer">
                    <div>
                      <small>Estimated Budget</small>
                      <strong>{formatBudget(tor.budget)}</strong>
                    </div>
                    <div>
                      <small>Agreed Price</small>
                      <strong>{formatBudget(tor.agreedPrice)}</strong>
                    </div>
                    <button className="icon-command" type="button" aria-label={`Bookmark ${tor.id}`} title="Bookmark TOR">
                      <Bookmark size={17} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Search size={28} />
              <h3>No TORs found</h3>
              <p>Try another keyword, status, or AI category.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
