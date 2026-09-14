import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { BrowseTorsClient } from "./browse-tors-client";

export default function BrowseTorsPage() {
  return (
    <>
      <SiteHeader active="Browse TORs" />
      <Suspense>
        <BrowseTorsClient />
      </Suspense>
    </>
  );
}
