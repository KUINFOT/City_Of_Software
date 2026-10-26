"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, Bookmark, BookmarkCheck, CalendarClock, Sparkles } from "lucide-react";
import { AccountShell } from "@/components/account-shell";
import { AccountMenu } from "@/components/account-menu";
import { useAuth } from "@/components/auth-provider";
import { BookmarkedProject, listBookmarks, removeBookmark, saveBookmark } from "@/lib/bookmarks-api";
import { getNotifications, VendorNotification } from "@/lib/notifications-api";
import { listTors, TorSummary } from "@/lib/tor-api";
import { getVendorProfile, ProfileCompleteness } from "@/lib/vendor-profile";

type DeadlineProject = TorSummary & { daysRemaining: number };

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

function formatDeadline(value: string | null | undefined) {
  return value
    ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    : "Not specified";
}

function formatDaysRemaining(days: number) {
  if (days === 0) return "Due today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

function matchPercentage(score: number | null) {
  if (score == null) return null;
  return `${Math.round(score <= 1 ? score * 100 : score)}% Match`;
}

function toBookmarkedProject(project: TorSummary | VendorNotification): BookmarkedProject {
  if ("torId" in project) {
    return {
      torId: project.torId,
      title: project.torTitle,
      agencyName: project.agencyName,
      projectType: null,
      budget: project.budgetThb,
      deadline: project.submissionDeadline,
      stage: project.type,
      savedAt: new Date().toISOString(),
    };
  }

  return {
    torId: project._id,
    title: project.title,
    agencyName: project.agencyName,
    projectType: null,
    budget: project.budget?.amountThb ?? null,
    deadline: project.timeline?.submissionDeadline ?? null,
    stage: project.lifecycle?.stage ?? null,
    savedAt: new Date().toISOString(),
  };
}

export default function DashboardPage() {
  const { user, token } = useAuth();
  const firstName = user?.name.split(" ")[0] ?? "คุณ";
  const [bookmarks, setBookmarks] = useState<BookmarkedProject[]>([]);
  const [matches, setMatches] = useState<VendorNotification[]>([]);
  const [deadlines, setDeadlines] = useState<DeadlineProject[]>([]);
  const [completeness, setCompleteness] = useState<ProfileCompleteness | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;

    Promise.allSettled([
      listBookmarks(token),
      user?.role === "vendor" ? getNotifications(token) : Promise.resolve([]),
      listTors(200),
    ]).then(([bookmarkResult, matchResult, torResult]) => {
      if (cancelled) return;
      const errors: string[] = [];

      if (bookmarkResult.status === "fulfilled") {
        setBookmarks(bookmarkResult.value);
      } else {
        errors.push(bookmarkResult.reason instanceof Error ? bookmarkResult.reason.message : "Unable to load saved projects.");
      }

      if (matchResult.status === "fulfilled") {
        const seenTorIds = new Set<string>();
        setMatches([...matchResult.value]
          .sort((a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1))
          .filter((match) => {
            if (seenTorIds.has(match.torId)) return false;
            seenTorIds.add(match.torId);
            return true;
          })
          .slice(0, 3));
      } else {
        errors.push(matchResult.reason instanceof Error ? matchResult.reason.message : "Unable to load AI recommendations.");
      }

      if (torResult.status === "fulfilled") {
        const today = new Date();
        const upcoming = torResult.value.flatMap((tor) => {
          const deadline = tor.timeline?.submissionDeadline;
          if (!deadline) return [];
          const daysRemaining = differenceInUtcDays(deadline, today);
          return daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 14
            ? [{ ...tor, daysRemaining }]
            : [];
        });
        upcoming.sort((a, b) => a.daysRemaining - b.daysRemaining);
        setDeadlines(upcoming.slice(0, 3));
      } else {
        errors.push(torResult.reason instanceof Error ? torResult.reason.message : "Unable to load upcoming deadlines.");
      }

      setError(errors.length > 0 ? errors.join(" ") : null);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [token, user?.role]);

  useEffect(() => {
    if (!user?.id || !token || user.role !== "vendor") return;
    let cancelled = false;
    getVendorProfile(user.id, token)
      .then((profile) => { if (!cancelled) setCompleteness(profile.completeness); })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : "Unable to load profile completeness.");
      });
    return () => { cancelled = true; };
  }, [token, user?.id, user?.role]);

  async function toggleBookmark(project: BookmarkedProject) {
    if (!token) return;
    setBusyIds((current) => new Set(current).add(project.torId));
    setError(null);
    try {
      if (bookmarks.some((bookmark) => bookmark.torId === project.torId)) {
        await removeBookmark(token, project.torId);
        setBookmarks((current) => current.filter((bookmark) => bookmark.torId !== project.torId));
      } else {
        await saveBookmark(token, project.torId);
        setBookmarks((current) => [project, ...current]);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update saved projects.");
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(project.torId);
        return next;
      });
    }
  }

  const bookmarkedIds = new Set(bookmarks.map((bookmark) => bookmark.torId));

  return (
    <AccountShell>
      <header className="account-header">
        <div>
          <h1>ยินดีต้อนรับกลับ, {firstName}</h1>
          <p>{user?.organization ?? "องค์กรของคุณ"} · {user?.role === "vendor" ? "บัญชีผู้ขาย" : `บัญชี ${user?.role}`}</p>
        </div>
        <div className="profile-actions">
          <button type="button" aria-label="การแจ้งเตือน"><Bell size={18} /></button>
          <AccountMenu compact />
        </div>
      </header>

      {user?.role === "vendor" && completeness && completeness.missingFields.length > 0 && <section className="dashboard-completeness-prompt" aria-label="ข้อมูลโปรไฟล์ที่ยังขาด">
        <div>
          <p>โปรไฟล์คุณครบ {completeness.score}%</p>
          <h2>เพิ่มข้อมูลอีก {completeness.missingFields.length} รายการ เพื่อรับการจับคู่ที่ตรงขึ้น</h2>
          <span>ยังขาด: {completeness.missingFields.map((field) => ({
            organizationType: "ประเภทองค์กร",
            companyName: "ชื่อบริษัท",
            techStack: "เทคโนโลยี",
            serviceCategories: "หมวดหมู่บริการ",
            yearsExperience: "ประสบการณ์",
            certifications: "ใบรับรอง",
            pastContracts: "ผลงานที่ผ่านมา",
          })[field.key]).join(" · ")}</span>
        </div>
        <Link className="button button--primary" href="/settings#profile">เติมข้อมูลโปรไฟล์</Link>
      </section>}

      {error && <p className="dashboard-error" role="alert">{error}</p>}

      <section className="dashboard-feature-section" aria-labelledby="saved-projects-heading">
        <div className="dashboard-feature-section__heading">
          <div>
            <h2 id="saved-projects-heading">Bookmarked Projects</h2>
          </div>
          <Link href="/saved-projects">Show All</Link>
        </div>
        {loading ? (
          <p className="dashboard-feature-state">Loading saved projects…</p>
        ) : bookmarks.length === 0 ? (
          <div className="dashboard-feature-state dashboard-feature-state--empty">
            <Bookmark size={20} />
            <p>No saved projects yet.</p>
            <Link href="/browse-tors">Browse TORs</Link>
          </div>
        ) : (
          <div className="dashboard-project-grid dashboard-project-grid--saved">
            {bookmarks.slice(0, 2).map((project) => (
              <article className="dashboard-project-card" key={project.torId}>
                <div className="dashboard-project-card__top">
                  <span className="dashboard-project-card__category">{project.projectType ?? project.stage ?? "Saved project"}</span>
                  <button
                    type="button"
                    className="dashboard-bookmark-button"
                    aria-label="Remove saved project"
                    title="Remove saved project"
                    disabled={busyIds.has(project.torId)}
                    onClick={() => { void toggleBookmark(project); }}
                  ><BookmarkCheck size={17} /></button>
                </div>
                <h3>{project.title}</h3>
                <p className="dashboard-project-card__agency">{project.agencyName}</p>
                <div className="dashboard-project-card__meta">
                  <div><small>ESTIMATED BUDGET</small><strong>{formatBudget(project.budget)}</strong></div>
                  <div><small>SUBMISSION DEADLINE</small><strong>{formatDeadline(project.deadline)}</strong></div>
                </div>
                <Link className="dashboard-project-card__view" href={`/tors/${project.torId}`}>View Project</Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-feature-section" aria-labelledby="recommendations-heading">
        <div className="dashboard-feature-section__heading">
          <div><h2 id="recommendations-heading">AI-Matched Recommended TORs</h2></div>
          <Link href="/ai-recommendations">Show All</Link>
        </div>
        {loading ? (
          <p className="dashboard-feature-state">Loading recommendations…</p>
        ) : user?.role !== "vendor" ? (
          <p className="dashboard-feature-state">AI recommendations are available for vendor accounts.</p>
        ) : matches.length === 0 ? (
          <div className="dashboard-feature-state dashboard-feature-state--empty">
            <Sparkles size={20} />
            <p>No AI-matched projects yet.</p>
          </div>
        ) : (
          <div className="dashboard-project-grid dashboard-project-grid--three">
            {matches.map((match) => {
              const project = toBookmarkedProject(match);
              return (
                <article className="dashboard-project-card" key={match._id}>
                  <div className="dashboard-project-card__top">
                    <span className="dashboard-project-card__category">{match.reasons[0]?.label ?? "AI recommendation"}</span>
                    <strong className="dashboard-project-card__match"><Sparkles size={14} />{matchPercentage(match.matchScore) ?? "AI Match"}</strong>
                  </div>
                  <h3>{match.torTitle}</h3>
                  <p className="dashboard-project-card__agency">{match.agencyName}</p>
                  <div className="dashboard-project-card__meta">
                    <div><small>ESTIMATED BUDGET</small><strong>{formatBudget(match.budgetThb)}</strong></div>
                    <div><small>SUBMISSION DEADLINE</small><strong>{formatDeadline(match.submissionDeadline)}</strong></div>
                  </div>
                  <div className="dashboard-project-card__actions">
                    <Link className="dashboard-project-card__view" href={`/tors/${match.torId}`}>View Project</Link>
                    <button
                      type="button"
                      className="dashboard-bookmark-button"
                      aria-label={bookmarkedIds.has(match.torId) ? "Remove saved project" : "Save project"}
                      aria-pressed={bookmarkedIds.has(match.torId)}
                      disabled={busyIds.has(match.torId)}
                      onClick={() => { void toggleBookmark(project); }}
                    >{bookmarkedIds.has(match.torId) ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="dashboard-feature-section" aria-labelledby="deadlines-heading">
        <div className="dashboard-feature-section__heading">
          <div><h2 id="deadlines-heading">Imminent Deadlines</h2></div>
          <Link href="/imminent-deadlines">Show All</Link>
        </div>
        {loading ? (
          <p className="dashboard-feature-state">Loading upcoming deadlines…</p>
        ) : deadlines.length === 0 ? (
          <div className="dashboard-feature-state dashboard-feature-state--empty">
            <CalendarClock size={20} />
            <p>No projects are due within the next 14 days.</p>
          </div>
        ) : (
          <div className="dashboard-project-grid dashboard-project-grid--three">
            {deadlines.map((project) => {
              const savedProject = toBookmarkedProject(project);
              return (
                <article className="dashboard-project-card" key={project._id}>
                  <div className="dashboard-project-card__top">
                    <span className="dashboard-project-card__category">{project.lifecycle?.stage ?? "Upcoming deadline"}</span>
                    <strong className="dashboard-project-card__match"><CalendarClock size={14} />{formatDaysRemaining(project.daysRemaining)}</strong>
                  </div>
                  <h3>{project.title}</h3>
                  <p className="dashboard-project-card__agency">{project.agencyName}</p>
                  <div className="dashboard-project-card__meta">
                    <div><small>ESTIMATED BUDGET</small><strong>{formatBudget(project.budget?.amountThb)}</strong></div>
                    <div><small>SUBMISSION DEADLINE</small><strong>{formatDeadline(project.timeline?.submissionDeadline)}</strong></div>
                  </div>
                  <div className="dashboard-project-card__actions">
                    <Link className="dashboard-project-card__view" href={`/tors/${project._id}`}>View Project</Link>
                    <button
                      type="button"
                      className="dashboard-bookmark-button"
                      aria-label={bookmarkedIds.has(project._id) ? "Remove saved project" : "Save project"}
                      aria-pressed={bookmarkedIds.has(project._id)}
                      disabled={busyIds.has(project._id)}
                      onClick={() => { void toggleBookmark(savedProject); }}
                    >{bookmarkedIds.has(project._id) ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </AccountShell>
  );
}
