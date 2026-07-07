import { Suspense } from "react";
import { CourierReportClient } from "./courier-report-client";

export default function CourierReportPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-zinc-500">Загружаем отчёт курьерского приложения…</div>
      }
    >
      <CourierReportClient />
    </Suspense>
  );
}
