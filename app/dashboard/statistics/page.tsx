import { Suspense } from "react";

import { auth } from "@/auth";

import { StatisticsClient } from "./statistics-client";

export default async function StatisticsPage() {
  const session = await auth();
  // Переоткрывать закрытую неделю может только админ — роль решаем на сервере.
  const isAdmin = session?.user?.role === "admin";

  return (
    <Suspense
      fallback={<div className="p-8 text-sm text-zinc-500">Загружаем статистику…</div>}
    >
      <StatisticsClient isAdmin={isAdmin} />
    </Suspense>
  );
}
