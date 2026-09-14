import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { TorDetailClient } from "./tor-detail-client";

export default function TorDetailPage() {
  return (
    <>
      <SiteHeader active="ค้นหา TOR" />
      <Suspense>
        <TorDetailClient />
      </Suspense>
    </>
  );
}
