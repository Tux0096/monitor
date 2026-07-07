import { Suspense } from "react";
import { AppealsReportClient } from "./appeals-report-client";

export default function AppealsReportPage() {
  return (
    <Suspense
      fallback={<div className="p-8 text-sm text-zinc-500">Загружаем отчёт по обращениям…</div>}
    >
      <AppealsReportClient />
    </Suspense>
  );
}
