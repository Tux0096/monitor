import { Suspense } from "react";
import { EmployeesClient } from "./employees-client";

export default function EmployeesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-zinc-500">Загружаем сотрудников…</div>}>
      <EmployeesClient />
    </Suspense>
  );
}
