import { Suspense } from "react";
import { ReportsView } from "@/components/reports-view";

export default function ReportsPage() {
  return (
    <Suspense fallback={<p className="p-8 text-muted">Loading report sources…</p>}>
      <ReportsView />
    </Suspense>
  );
}
