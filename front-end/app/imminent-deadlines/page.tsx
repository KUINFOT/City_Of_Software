"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, BriefcaseBusiness } from "lucide-react";
import { AccountMenu } from "@/components/account-menu";
import { AccountShell } from "@/components/account-shell";
import { MatchGrid } from "@/components/match-grid";
import { useAuth } from "@/components/auth-provider";
import { listBookmarks, removeBookmark, saveBookmark } from "@/lib/bookmarks-api";
import { listTors, TorSummary } from "@/lib/tor-api";

type ImminentProject = TorSummary & { daysRemaining: number };

function differenceInUtcDays(deadline: string, today: Date): number | null {
  const date = new Date(`${deadline.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const deadlineDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.floor((deadlineDay - todayDay) / 86_400_000);
}

function formatBudget(value: number | null | undefined) {
  return value == null ? "Not specified" : `฿${new Intl.NumberFormat("th-TH").format(value)}`;
}

function formatDeadline(value: string, daysRemaining: number) {
  const date = new Date(value).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `${daysRemaining === 0 ? "Due today" : `${daysRemaining} days left`} · ${date}`;
}

export default function ImminentDeadlinesPage() {
  const { token } = useAuth();
  const [projects, setProjects] = useState<ImminentProject[]>([]);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const today = new Date();
    Promise.all([
      listTors(200),
      token ? listBookmarks(token) : Promise.resolve([]),
    ])
      .then(([tors, bookmarks]) => {
        if (cancelled) return;
        const imminent = tors.flatMap((tor) => {
          const deadline = tor.timeline?.submissionDeadline;
          if (!deadline) return [];
          const daysRemaining = differenceInUtcDays(deadline, today);
          return daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 14
            ? [{ ...tor, daysRemaining }]
            : [];
        });
        imminent.sort((a, b) => a.daysRemaining - b.daysRemaining);
        setProjects(imminent);
        setBookmarkedIds(new Set(bookmarks.map((bookmark) => bookmark.torId)));
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : "ไม่สามารถโหลดโครงการที่ใกล้ถึงกำหนดส่งได้");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  async function toggleBookmark(torId: string) {
    if (!token) return;
    setBusyIds((current) => new Set(current).add(torId));
    setError(null);
    try {
      if (bookmarkedIds.has(torId)) {
        await removeBookmark(token, torId);
        setBookmarkedIds((current) => {
          const next = new Set(current);
          next.delete(torId);
          return next;
        });
      } else {
        await saveBookmark(token, torId);
        setBookmarkedIds((current) => new Set(current).add(torId));
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "บันทึกโครงการไม่สำเร็จ");
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(torId);
        return next;
      });
    }
  }

  const today = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "long", year: "numeric" }).format(new Date());

  return (
    <AccountShell>
      <header className="account-header">
        <div>
          <h1>กำหนดส่งที่ใกล้ถึง</h1>
          <p>ติดตามโครงการ TOR ที่มีกำหนดส่งภายใน 14 วันข้างหน้า</p>
        </div>
        <div className="profile-actions"><AccountMenu compact /></div>
      </header>

      <div className="deadline-window">
        <AlertTriangle size={20} />
        <div><strong>ช่วงกำหนดส่งที่กำลังจะมาถึง</strong><span>แสดงเฉพาะโครงการที่ยังไม่พ้นกำหนดและเหลือเวลาไม่เกิน 14 วัน · วันนี้ {today}</span></div>
      </div>

      <section className="project-collection" aria-labelledby="imminent-projects-heading">
        <div className="project-collection__heading">
          <div><h2 id="imminent-projects-heading">โครงการใกล้ถึงกำหนด</h2></div>
          <p>เรียงตามกำหนดส่งที่ใกล้ที่สุด</p>
        </div>
        {error && <p className="bookmark-error" role="alert">{error}</p>}
        {loading ? (
          <p className="project-collection__state">กำลังโหลดโครงการ…</p>
        ) : projects.length === 0 ? (
          <div className="project-collection__empty">
            <BriefcaseBusiness size={24} />
            <h3>ไม่มีโครงการใกล้ถึงกำหนด</h3>
            <p>ขณะนี้ไม่มีโครงการที่มีกำหนดส่งภายใน 14 วันข้างหน้า</p>
          </div>
        ) : (
          <MatchGrid
            matches={projects.map((project) => {
              const deadline = project.timeline?.submissionDeadline;
              return {
                id: project._id,
                icon: BriefcaseBusiness,
                category: project.lifecycle?.stage ?? "Upcoming deadline",
                match: `${project.daysRemaining} days`,
                title: project.title,
                agency: project.agencyName,
                budget: formatBudget(project.budget?.amountThb),
                deadline: deadline ? formatDeadline(deadline, project.daysRemaining) : "Not specified",
              };
            })}
            bookmarkedIds={bookmarkedIds}
            busyIds={busyIds}
            onToggleBookmark={(id) => { void toggleBookmark(id); }}
          />
        )}
      </section>
    </AccountShell>
  );
}