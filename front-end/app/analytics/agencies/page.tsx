import { Suspense } from "react";
import { AgenciesClient } from "./agencies-client";

export default function AgencyFrequencyPage() {
  return (
    <Suspense>
      <AgenciesClient />
    </Suspense>
  );
}
