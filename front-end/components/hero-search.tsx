import { Search } from "lucide-react";

export function HeroSearch() {
  return (
    <form className="hero-search" action="/browse-tors" method="get">
      <Search size={21} />
      <input
        aria-label="ค้นหา TOR"
        name="q"
        placeholder="ค้นหา เช่น ‘AI Cloud, Cybersecurity, Smart City...’"
      />
      <button className="button button--orange" type="submit">ค้นหา TOR</button>
    </form>
  );
}
