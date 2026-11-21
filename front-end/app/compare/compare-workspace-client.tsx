"use client";

import { useSearchParams } from "next/navigation";
import { CompareSelectorClient } from "./compare-selector-client";
import { CompareTorsClient } from "./compare-tors-client";

export function CompareWorkspaceClient() {
  const searchParams = useSearchParams();
  const ids = (searchParams.get("ids") ?? "").split(",").filter(Boolean);
  return ids.length > 0 ? <CompareTorsClient /> : <CompareSelectorClient />;
}
