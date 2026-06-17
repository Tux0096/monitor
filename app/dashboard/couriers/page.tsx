import { Suspense } from "react";
import { CouriersClient } from "./couriers-client";

export default function CouriersPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-zinc-500">Загружаем курьеров…</div>}>
      <CouriersClient />
    </Suspense>
  );
}
