import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { CompareTorsClient } from "./compare-tors-client";

export default function CompareTorsPage() {
  return (
    <>
      <SiteHeader active="ค้นหา TOR" />
      <Suspense>
        <CompareTorsClient />
      </Suspense>
    </>
  );
}
