import { Suspense } from "react";
import { AccountShell } from "@/components/account-shell";
import { CompareWorkspaceClient } from "./compare-workspace-client";

export default function CompareTorsPage() {
  return (
    <AccountShell>
      <Suspense>
        <CompareWorkspaceClient />
      </Suspense>
    </AccountShell>
  );
}
