"use client";

import { useEffect, useState } from "react";
import { Bookmark, BriefcaseBusiness, Save, StickyNote, X } from "lucide-react";
import { AccountMenu } from "@/components/account-menu";
import { AccountShell } from "@/components/account-shell";
import { MatchGrid } from "@/components/match-grid";
import { useAuth } from "@/components/auth-provider";
import { BookmarkedProject, listBookmarks, removeBookmark } from "@/lib/bookmarks-api";
import { updateSavedTorNote } from "@/lib/tor-api";

const icons = [Bookmark, BriefcaseBusiness];

function formatBudget(value: number | null) {
  return value == null ? "Not specified" : `฿${new Intl.NumberFormat("th-TH").format(value)}`;
}

function formatDeadline(value: string | null) {
  return value ? new Date(value).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "Not specified";
}

export default function SavedProjectsPage() {
  const { token } = useAuth();
  const [projects, setProjects] = useState<BookmarkedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [noteProject, setNoteProject] = useState<BookmarkedProject | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    listBookmarks(token)
      .then((result) => { if (!cancelled) setProjects(result); })
      .catch((requestError: unknown) => { if (!cancelled) setError(requestError instanceof Error ? requestError.message : "ไม่สามารถโหลดโครงการที่บันทึกไว้ได้"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  async function toggleBookmark(torId: string) {
    if (!token) return;
    setBusyIds((current) => new Set(current).add(torId));
    setError(null);
    try {
      await removeBookmark(token, torId);
      setProjects((current) => current.filter((project) => project.torId !== torId));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "ไม่สามารถนำโครงการออกจากรายการที่บันทึกไว้ได้");
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(torId);
        return next;
      });
    }
  }

  function openNote(project: BookmarkedProject) {
    setNoteProject(project);
    setNoteDraft(project.note ?? "");
    setNoteError(null);
  }

  async function saveNote() {
    if (!token || !noteProject || noteSaving) return;
    setNoteSaving(true);
    setNoteError(null);
    try {
      const result = await updateSavedTorNote(noteProject.torId, noteDraft, token);
      setProjects((current) => current.map((project) => project.torId === noteProject.torId ? { ...project, note: result.note } : project));
      setNoteProject(null);
    } catch (requestError) {
      setNoteError(requestError instanceof Error ? requestError.message : "บันทึกโน้ตไม่สำเร็จ");
    } finally {
      setNoteSaving(false);
    }
  }

  const ids = new Set(projects.map((project) => project.torId));

  return (
    <AccountShell>
      <header className="account-header">
        <div>
          <h1>โครงการที่บันทึกไว้</h1>
          <p>รวมโครงการ TOR ที่คุณบันทึกไว้เพื่อกลับมาดูภายหลัง</p>
        </div>
        <div className="profile-actions"><AccountMenu compact /></div>
      </header>

      <section className="project-collection" aria-labelledby="saved-projects-heading">
        <div className="project-collection__heading">
          <div><h2 id="saved-projects-heading">รายการที่บันทึกไว้</h2></div>
          <p>โครงการที่บันทึกไว้จะแสดงที่นี่</p>
        </div>
        {error && <p className="bookmark-error" role="alert">{error}</p>}
        {loading ? (
          <p className="project-collection__state">กำลังโหลดโครงการที่บันทึกไว้…</p>
        ) : projects.length === 0 ? (
          <div className="project-collection__empty">
            <Bookmark size={24} />
            <h3>ยังไม่มีโครงการที่บันทึกไว้</h3>
            <p>บันทึกโครงการจากหน้าค้นหาหรือรายละเอียด TOR เพื่อดูภายหลัง</p>
          </div>
        ) : (
          <MatchGrid
            matches={projects.map((project, index) => ({
              id: project.torId,
              icon: icons[index % icons.length],
              category: project.projectType ?? "Software Project",
              match: "Saved",
              title: project.title,
              agency: project.agencyName,
              budget: formatBudget(project.budget),
              deadline: formatDeadline(project.deadline),
              note: project.note,
            }))}
            bookmarkedIds={ids}
            busyIds={busyIds}
            onToggleBookmark={(id) => { void toggleBookmark(id); }}
            onEditNote={(match) => {
              const project = projects.find((item) => item.torId === match.id);
              if (project) openNote(project);
            }}
          />
        )}
      </section>

      {noteProject && <div className="saved-note-drawer" role="presentation">
        <button className="saved-note-drawer__backdrop" type="button" aria-label="ปิดหน้าต่างโน้ต" onClick={() => setNoteProject(null)} />
        <aside className="saved-note-drawer__panel" role="dialog" aria-modal="true" aria-labelledby="saved-note-heading">
          <header>
            <span><StickyNote size={19} /></span>
            <div><p>โน้ตส่วนตัว</p><h2 id="saved-note-heading">{noteProject.title}</h2></div>
            <button type="button" aria-label="ปิด" onClick={() => setNoteProject(null)}><X size={19} /></button>
          </header>
          <label htmlFor="saved-project-note">เขียนสิ่งที่อยากจำเกี่ยวกับโครงการนี้</label>
          <textarea id="saved-project-note" value={noteDraft} maxLength={2000} autoFocus placeholder="เช่น นัดคุยทีมก่อนตัดสินใจเสนอราคา" onChange={(event) => setNoteDraft(event.target.value)} />
          <small>{noteDraft.length.toLocaleString("th-TH")} / 2,000 ตัวอักษร</small>
          {noteError && <p className="saved-note-drawer__error" role="alert">{noteError}</p>}
          <footer><button type="button" onClick={() => setNoteProject(null)}>ยกเลิก</button><button className="saved-note-drawer__save" type="button" onClick={() => { void saveNote(); }} disabled={noteSaving}><Save size={16} />{noteSaving ? "กำลังบันทึก..." : "บันทึกโน้ต"}</button></footer>
        </aside>
      </div>}
    </AccountShell>
  );
}
