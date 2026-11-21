"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Bell, Bookmark, FileText, Search, Scale, SlidersHorizontal, X } from "lucide-react";
import { AccountMenu } from "@/components/account-menu";
import { useAuth } from "@/components/auth-provider";
import { BookmarkedProject, listBookmarks } from "@/lib/bookmarks-api";

function formatBudget(value: number | null) {
  return value == null ? "ไม่ระบุ" : `฿${new Intl.NumberFormat("th-TH").format(value)}`;
}

function formatDeadline(value: string | null) {
  return value
    ? new Date(value).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    : "ไม่ระบุ";
}

export function CompareSelectorClient() {
  const router = useRouter();
  const { user, token } = useAuth();
  const [projects, setProjects] = useState<BookmarkedProject[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "deadline" | "budget">("recent");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || user?.role !== "vendor") {
      setLoading(false);
      setError("การเปรียบเทียบ TOR ใช้ได้เฉพาะบัญชีผู้ขายที่เข้าสู่ระบบ");
      return;
    }

    let cancelled = false;
    setLoading(true);
    listBookmarks(token)
      .then((result) => { if (!cancelled) setProjects(result); })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : "ไม่สามารถโหลด TOR ที่บันทึกไว้ได้");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, user?.role]);

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("th-TH");
    const results = normalizedQuery
      ? projects.filter((project) => `${project.title} ${project.agencyName} ${project.projectType ?? ""}`.toLocaleLowerCase("th-TH").includes(normalizedQuery))
      : projects;

    return [...results].sort((first, second) => {
      if (sort === "budget") return (second.budget ?? -1) - (first.budget ?? -1);
      if (sort === "deadline") return (first.deadline ?? "9999-12-31").localeCompare(second.deadline ?? "9999-12-31");
      return second.savedAt.localeCompare(first.savedAt);
    });
  }, [projects, query, sort]);

  const selectedProjects = projects.filter((project) => selectedIds.has(project.torId));

  function toggleSelection(torId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(torId)) {
        next.delete(torId);
        return next;
      }
      if (next.size < 4) next.add(torId);
      return next;
    });
  }

  function compareSelected() {
    if (selectedIds.size < 2) return;
    router.push(`/compare?ids=${encodeURIComponent(Array.from(selectedIds).join(","))}`);
  }

  return (
    <>
      <header className="account-header compare-selector__account-header">
        <div />
        <div className="profile-actions">
          <button type="button" aria-label="การแจ้งเตือน"><Bell size={18} /></button>
          <AccountMenu compact />
        </div>
      </header>

      <section className="compare-selector" aria-labelledby="compare-selector-heading">
        <div className="compare-selector__intro">
          <span className="compare-selector__hero-icon"><Scale size={28} /></span>
          <div>
            <h1 id="compare-selector-heading">เปรียบเทียบ TOR</h1>
            <p>เลือก 2–4 โครงการเพื่อเปรียบเทียบรายละเอียดสำคัญ เช่น ขอบเขตงาน งบประมาณ และระยะเวลาดำเนินการ</p>
          </div>
        </div>

        <ol className="compare-selector__steps" aria-label="ขั้นตอนการเปรียบเทียบ">
          <li className="active"><span>1</span><strong>เลือกโครงการ (2–4 โครงการ)</strong></li>
          <li className="compare-selector__connector" aria-hidden="true" />
          <li><span>2</span><strong>ดูผลการเปรียบเทียบ</strong></li>
        </ol>

        <div className="compare-selector__layout">
          <section className="compare-selector__catalogue" aria-labelledby="compare-list-heading">
            <label className="compare-selector__search">
              <Search size={18} />
              <span className="sr-only">ค้นหา TOR ที่บันทึกไว้</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาชื่อโครงการ, หน่วยงาน, หรือคำสำคัญ" />
            </label>
            <div className="compare-selector__toolbar">
              <div><h2 id="compare-list-heading">รายการ TOR ที่บันทึกไว้</h2><small>พบ {filteredProjects.length} โครงการ</small></div>
              <label><SlidersHorizontal size={15} /><span className="sr-only">จัดเรียงรายการ</span><select value={sort} onChange={(event) => setSort(event.target.value as "recent" | "deadline" | "budget")}><option value="recent">ล่าสุด</option><option value="deadline">กำหนดส่งใกล้สุด</option><option value="budget">งบประมาณสูงสุด</option></select></label>
            </div>

            {loading ? <p className="compare-selector__state">กำลังโหลดรายการ TOR ที่บันทึกไว้…</p> : error ? <p className="compare-selector__state" role="alert">{error}</p> : filteredProjects.length === 0 ? <p className="compare-selector__state">ไม่พบ TOR ที่บันทึกไว้ตรงกับการค้นหา</p> : (
              <div className="compare-selector__list">
                {filteredProjects.map((project) => {
                  const selected = selectedIds.has(project.torId);
                  return <article className={selected ? "compare-selector__row selected" : "compare-selector__row"} key={project.torId}>
                    <label className="compare-selector__check"><input type="checkbox" checked={selected} onChange={() => toggleSelection(project.torId)} aria-label={`เลือก ${project.title} เพื่อเปรียบเทียบ`} /><span /></label>
                    <div className="compare-selector__project"><h3>{project.title}</h3><p>{project.agencyName}</p><span>{project.projectType ?? project.stage ?? "TOR ที่บันทึกไว้"}</span></div>
                    <div className="compare-selector__metric"><small>วงเงินงบประมาณ</small><strong>{formatBudget(project.budget)}</strong></div>
                    <div className="compare-selector__metric"><small>กำหนดส่ง</small><strong>{formatDeadline(project.deadline)}</strong></div>
                    <Bookmark size={19} aria-label="โครงการที่บันทึกไว้" />
                  </article>;
                })}
              </div>
            )}
          </section>

          <aside className="compare-selector__selection" aria-labelledby="selected-tors-heading">
            <div className="compare-selector__selection-title"><h2 id="selected-tors-heading">โครงการที่เลือกเปรียบเทียบ</h2><strong>{selectedIds.size} / 4 โครงการ</strong></div>
            <div className="compare-selector__selected-list">
              {selectedProjects.length === 0 ? <p>เลือก TOR อย่างน้อย 2 รายการเพื่อเริ่มการเปรียบเทียบ</p> : selectedProjects.map((project) => <div key={project.torId}><FileText size={18} /><span><strong>{project.title}</strong><small>{project.agencyName}</small></span><button type="button" aria-label={`นำ ${project.title} ออกจากรายการเปรียบเทียบ`} onClick={() => toggleSelection(project.torId)}><X size={17} /></button></div>)}
            </div>
            <button className="compare-selector__submit" type="button" onClick={compareSelected} disabled={selectedIds.size < 2}><Scale size={18} />เปรียบเทียบ ({selectedIds.size} โครงการ)<ArrowRight size={18} /></button>
            <button className="compare-selector__clear" type="button" onClick={() => setSelectedIds(new Set())} disabled={selectedIds.size === 0}>ล้างรายการที่เลือก</button>
          </aside>
        </div>
      </section>
    </>
  );
}
