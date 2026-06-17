"use client";

import type { DeliveryPoint } from "@/lib/points";
import { useEffect, useState } from "react";

type PointsResponse = {
  points: DeliveryPoint[];
};

export function PointsClient() {
  const [points, setPoints] = useState<DeliveryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [notes, setNotes] = useState("");

  async function loadPoints() {
    setLoading(true);
    try {
      const response = await fetch("/api/points", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as PointsResponse;
      setPoints(data.points);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPoints();
  }, []);

  async function createPoint(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, city, notes }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(data?.error ?? "Не удалось создать точку");
        return;
      }
      setName("");
      setCity("");
      setNotes("");
      await loadPoints();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(point: DeliveryPoint) {
    const response = await fetch(`/api/points/${point.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !point.isActive }),
    });
    if (response.ok) await loadPoints();
  }

  const activeCount = points.filter((point) => point.isActive).length;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <p className="text-xs text-zinc-600">Справочник</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Точки</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Точки выдачи и работы курьеров. Привязываются к карточке курьера и обращению.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <form
          onSubmit={createPoint}
          className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5"
        >
          <h2 className="text-sm font-medium text-white">Новая точка</h2>
          <label className="mt-4 block text-xs text-zinc-500">
            Название
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Например: Самара · Ленина 12"
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
            />
          </label>
          <label className="mt-3 block text-xs text-zinc-500">
            Город
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Самара"
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
            />
          </label>
          <label className="mt-3 block text-xs text-zinc-500">
            Примечание
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
            />
          </label>
          {error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="mt-4 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-sky-400 disabled:opacity-50"
          >
            {saving ? "Создаём…" : "Создать точку"}
          </button>
        </form>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-white">Список точек</h2>
            <span className="text-xs text-zinc-500">
              {activeCount} активн. · {points.length} всего
            </span>
          </div>
          {loading ? (
            <p className="mt-4 text-sm text-zinc-500">Загрузка…</p>
          ) : points.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">Точек пока нет — создайте первую слева.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {points.map((point) => (
                <li
                  key={point.id}
                  className={`rounded-xl border px-4 py-3 ${
                    point.isActive
                      ? "border-zinc-800 bg-zinc-900/50"
                      : "border-zinc-800/60 bg-zinc-900/20 opacity-70"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-zinc-100">{point.name}</div>
                      {point.city ? (
                        <div className="mt-1 text-xs text-zinc-500">{point.city}</div>
                      ) : null}
                      {point.notes ? (
                        <div className="mt-2 text-xs text-zinc-400">{point.notes}</div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => void toggleActive(point)}
                      className={
                        point.isActive
                          ? "shrink-0 rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300"
                          : "shrink-0 rounded-lg border border-emerald-500/40 px-2 py-1 text-xs text-emerald-200"
                      }
                    >
                      {point.isActive ? "Выключить" : "Включить"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
