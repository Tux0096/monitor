import { Suspense } from "react";
import { TemperatureClient } from "./temperature-client";

export default function TemperaturePage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-zinc-500">Загружаем температуры…</div>}>
      <TemperatureClient />
    </Suspense>
  );
}
