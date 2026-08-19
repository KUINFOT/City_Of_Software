import Link from "next/link";
import { Building2 } from "lucide-react";

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link href="/" className={`brand ${inverse ? "brand--inverse" : ""}`}>
      <span className="brand__mark"><Building2 size={19} strokeWidth={1.8} /></span>
      <span className="brand__copy">
        <strong>CITY OF SOFTWARE</strong>
        <small>BMA TOR PORTAL</small>
      </span>
    </Link>
  );
}
