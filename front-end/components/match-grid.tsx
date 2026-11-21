import Link from "next/link";
import { Bookmark, BookmarkCheck, Sparkles, StickyNote } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Match = {
  id: string;
  icon: LucideIcon;
  category: string;
  match: string;
  title: string;
  agency: string;
  budget: string;
  deadline: string;
  note?: string;
};

type MatchGridProps = {
  matches: Match[];
  bookmarkedIds: ReadonlySet<string>;
  busyIds?: ReadonlySet<string>;
  onToggleBookmark: (id: string) => void;
  onEditNote?: (match: Omit<Match, "icon">) => void;
};

export function MatchGrid({ matches, bookmarkedIds, busyIds, onToggleBookmark, onEditNote }: MatchGridProps) {
  return (
    <div className="match-grid">
      {matches.map(({ icon: Icon, ...match }) => (
        <article className="match-card" key={match.id}>
          <div className="match-card__top">
            <span>
              <Icon size={14} />
              {match.category}
            </span>

            <div className="match-card__tools">
              {onEditNote && <button type="button" className={match.note ? "match-card__note-button has-note" : "match-card__note-button"} aria-label={`โน้ตส่วนตัวสำหรับ ${match.title}`} title={match.note ? "แก้ไขโน้ตส่วนตัว" : "เพิ่มโน้ตส่วนตัว"} onClick={() => onEditNote(match)}><StickyNote size={15} /></button>}
              <strong><Sparkles size={14} />{match.match}</strong>
            </div>
          </div>

          <h3>{match.title}</h3>
          <p>{match.agency}</p>
          {match.note && <p className="match-card__note-preview"><StickyNote size={12} />{match.note}</p>}

          <div className="card-meta">
            <div>
              <small>ESTIMATED BUDGET</small>
              <strong>{match.budget}</strong>
            </div>

            <div>
              <small>SUBMISSION DEADLINE</small>
              <strong>{match.deadline}</strong>
            </div>
          </div>

          <div className="card-actions">
            <Link href={`/tors/${match.id}`}>View Project</Link>
            <button
              type="button"
              aria-label={bookmarkedIds.has(match.id) ? "นำออกจากโครงการที่บันทึกไว้" : "บันทึกโครงการ"}
              title={bookmarkedIds.has(match.id) ? "นำออกจากโครงการที่บันทึกไว้" : "บันทึกโครงการ"}
              aria-pressed={bookmarkedIds.has(match.id)}
              disabled={busyIds?.has(match.id)}
              onClick={() => onToggleBookmark(match.id)}
            >
              {bookmarkedIds.has(match.id) ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
