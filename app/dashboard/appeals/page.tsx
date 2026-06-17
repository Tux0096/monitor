import { Suspense } from "react";
import { AppealsClient } from "./appeals-client";

export default function AppealsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-zinc-500">Загружаем обращения…</div>}>
      <AppealsClient />
    </Suspense>
  );
}
