import { Search } from "lucide-react";

export function HeroSearch() {
  return (
    <form className="hero-search" action="/dashboard" method="get">
      <Search size={21} />
      <input
        aria-label="Search TORs"
        name="q"
        placeholder="Search ‘AI Cloud, Cybersecurity, Smart City software...’"
      />
      <button className="button button--orange" type="submit">Search TORs</button>
    </form>
  );
}
