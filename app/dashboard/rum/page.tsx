import { Suspense } from "react";

import { RumClient } from "./rum-client";

export default function RumPage() {
  return (
    <Suspense
      fallback={<div className="p-8 text-sm text-zinc-500">Загружаем метрики…</div>}
    >
      <RumClient />
    </Suspense>
  );
}
