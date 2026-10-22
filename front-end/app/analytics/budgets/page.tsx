import { Suspense } from "react";
import { BudgetsClient } from "./budgets-client";

export default function BudgetAnalyticsPage() {
  return (
    <Suspense>
      <BudgetsClient />
    </Suspense>
  );
}
