import Link from "next/link";
import { Bookmark, Sparkles } from "lucide-react";
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
};

type MatchGridProps = {
  matches: Match[];
};

export function MatchGrid({ matches }: MatchGridProps) {
  return (
    <div className="match-grid">
      {matches.map(({ icon: Icon, ...match }) => (
        <article className="match-card" key={match.id}>
          <div className="match-card__top">
            <span>
              <Icon size={14} />
              {match.category}
            </span>

            <strong>
              <Sparkles size={14} />
              {match.match}
            </strong>
          </div>

          <h3>{match.title}</h3>
          <p>{match.agency}</p>

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
            <button aria-label="Bookmark">
              <Bookmark size={16} />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}