"use client";

import { useCallback, useEffect, useState } from "react";

type Audience = { id: number; name: string; is_everyone: boolean };

type BenefitRow = {
  id: number;
  title: string;
  kind: string;
  is_published: boolean;
  audience_id: number | null;
  audience_name: string | null;
  shared_code: string | null;
  codes_total: number;
  codes_free: number;
};

type KbSection = {
  id: number;
  title: string;
  is_published: boolean;
  audience_name: string | null;
};

type KbArticle = {
  id: number;
  section_id: number | null;
  title: string;
  is_published: boolean;
  audience_name: string | null;
  views: number;
};

type Call = (path: string, init?: RequestInit) => Promise<unknown | null>;

export function BenefitsTab({
  call,
  audiences,
  busy,
}: {
  call: Call;
  audiences: Audience[];
  busy: boolean;
}) {
  const [items, setItems] = useState<BenefitRow[]>([]);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"shared" | "personal">("shared");
  const [audienceId, setAudienceId] = useState("");
  const [sharedCode, setSharedCode] = useState("");
  const [description, setDescription] = useState("");
  const [codesFor, setCodesFor] = useState<number | null>(null);
  const [codes, setCodes] = useState("");

  const load = useCallback(async () => {
    const data = (await call("benefits")) as { items: BenefitRow[] } | null;
    setItems(data?.items ?? []);
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <h3 className="text-sm font-medium text-white">Новый бонус</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название"
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "shared" | "personal")}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          >
            <option value="shared">Общая привилегия</option>
            <option value="personal">Персональные промокоды</option>
          </select>
          <select
            value={audienceId}
            onChange={(e) => setAudienceId(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          >
            <option value="">Аудитория не выбрана</option>
            {audiences.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        {kind === "shared" ? (
          <input
            value={sharedCode}
            onChange={(e) => setSharedCode(e.target.value)}
            placeholder="Общий код (один на всех)"
            className="mt-3 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        ) : (
          <p className="mt-3 text-xs text-zinc-500">
            Персональные коды загружаются отдельно после создания бонуса.
            Опубликовать бонус с пустым пулом нельзя — первый же сотрудник
            получил бы «промокоды закончились».
          </p>
        )}
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Описание (Markdown)"
          rows={3}
          className="mt-3 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
        />
        <button
          type="button"
          disabled={busy || !title.trim()}
          onClick={async () => {
            const created = await call("benefits", {
              method: "POST",
              body: JSON.stringify({
                title,
                descriptionMd: description,
                kind,
                audienceId: audienceId ? Number(audienceId) : null,
                sharedCode: sharedCode || null,
              }),
            });
            if (created) {
              setTitle("");
              setSharedCode("");
              setDescription("");
              await load();
            }
          }}
          className="mt-3 rounded-lg border border-sky-700 bg-sky-500/10 px-4 py-2 text-sm text-sky-300 hover:bg-sky-500/20 disabled:opacity-40"
        >
          Создать
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Название</th>
              <th className="px-4 py-3 text-left font-medium">Тип</th>
              <th className="px-4 py-3 text-left font-medium">Аудитория</th>
              <th className="px-4 py-3 text-right font-medium">Коды</th>
              <th className="px-4 py-3 text-left font-medium">Статус</th>
              <th className="px-4 py-3 text-right font-medium">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-zinc-600">
                  Бонусов нет
                </td>
              </tr>
            ) : null}
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-zinc-900/40">
                <td className="px-4 py-3 text-zinc-200">{item.title}</td>
                <td className="px-4 py-3 text-zinc-400">
                  {item.kind === "personal" ? "персональные" : "общая"}
                </td>
                <td className="px-4 py-3 text-zinc-400">
                  {item.audience_name ?? <span className="text-rose-400">не выбрана</span>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-400">
                  {item.kind === "personal" ? (
                    <span className={item.codes_free === 0 ? "text-rose-400" : ""}>
                      {item.codes_free} / {item.codes_total}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      item.is_published
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {item.is_published ? "опубликован" : "черновик"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {item.kind === "personal" ? (
                      <button
                        type="button"
                        onClick={() => setCodesFor(codesFor === item.id ? null : item.id)}
                        className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                      >
                        Коды
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        const ok = await call(`benefits/${item.id}/publish`, {
                          method: "POST",
                          body: JSON.stringify({ publish: !item.is_published }),
                        });
                        if (ok) await load();
                      }}
                      className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {item.is_published ? "Снять" : "Опубликовать"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {codesFor != null ? (
              <tr>
                <td colSpan={6} className="bg-zinc-900/40 px-4 py-4">
                  <p className="mb-2 text-xs text-zinc-500">
                    Коды по одному в строке или через запятую. Повторы и уже
                    загруженные пропускаются: один код не должен достаться двоим.
                  </p>
                  <textarea
                    value={codes}
                    onChange={(e) => setCodes(e.target.value)}
                    rows={4}
                    placeholder={"CODE-001\nCODE-002\nCODE-003"}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100"
                  />
                  <button
                    type="button"
                    disabled={busy || !codes.trim()}
                    onClick={async () => {
                      const result = (await call(`benefits/${codesFor}/codes`, {
                        method: "POST",
                        body: JSON.stringify({ codes }),
                      })) as { added: number; skipped: number } | null;
                      if (result) {
                        setCodes("");
                        setCodesFor(null);
                        await load();
                      }
                    }}
                    className="mt-2 rounded-lg border border-sky-700 bg-sky-500/10 px-4 py-2 text-sm text-sky-300 hover:bg-sky-500/20 disabled:opacity-40"
                  >
                    Загрузить
                  </button>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function KbTab({
  call,
  audiences,
  busy,
}: {
  call: Call;
  audiences: Audience[];
  busy: boolean;
}) {
  const [sections, setSections] = useState<KbSection[]>([]);
  const [articles, setArticles] = useState<KbArticle[]>([]);
  const [sectionTitle, setSectionTitle] = useState("");
  const [sectionAudience, setSectionAudience] = useState("");
  const [articleTitle, setArticleTitle] = useState("");
  const [articleSection, setArticleSection] = useState("");
  const [articleAudience, setArticleAudience] = useState("");
  const [articleBody, setArticleBody] = useState("");

  const load = useCallback(async () => {
    const data = (await call("kb")) as {
      sections: KbSection[];
      articles: KbArticle[];
    } | null;
    setSections(data?.sections ?? []);
    setArticles(data?.articles ?? []);
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  const audienceSelect = (value: string, onChange: (v: string) => void) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
    >
      <option value="">Аудитория не выбрана</option>
      {audiences.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <h3 className="text-sm font-medium text-white">Новый раздел</h3>
          <div className="mt-3 grid gap-3">
            <input
              value={sectionTitle}
              onChange={(e) => setSectionTitle(e.target.value)}
              placeholder="Название раздела"
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            />
            {audienceSelect(sectionAudience, setSectionAudience)}
          </div>
          <button
            type="button"
            disabled={busy || !sectionTitle.trim()}
            onClick={async () => {
              const ok = await call("kb/sections", {
                method: "POST",
                body: JSON.stringify({
                  title: sectionTitle,
                  audienceId: sectionAudience ? Number(sectionAudience) : null,
                }),
              });
              if (ok) {
                setSectionTitle("");
                await load();
              }
            }}
            className="mt-3 rounded-lg border border-sky-700 bg-sky-500/10 px-4 py-2 text-sm text-sky-300 hover:bg-sky-500/20 disabled:opacity-40"
          >
            Создать раздел
          </button>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <h3 className="text-sm font-medium text-white">Новая статья</h3>
          <div className="mt-3 grid gap-3">
            <input
              value={articleTitle}
              onChange={(e) => setArticleTitle(e.target.value)}
              placeholder="Заголовок"
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={articleSection}
                onChange={(e) => setArticleSection(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              >
                <option value="">Без раздела</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
              {audienceSelect(articleAudience, setArticleAudience)}
            </div>
            <textarea
              value={articleBody}
              onChange={(e) => setArticleBody(e.target.value)}
              placeholder="Текст (Markdown)"
              rows={4}
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            />
          </div>
          <button
            type="button"
            disabled={busy || !articleTitle.trim()}
            onClick={async () => {
              const ok = await call("kb/articles", {
                method: "POST",
                body: JSON.stringify({
                  title: articleTitle,
                  bodyMd: articleBody,
                  sectionId: articleSection ? Number(articleSection) : null,
                  audienceId: articleAudience ? Number(articleAudience) : null,
                }),
              });
              if (ok) {
                setArticleTitle("");
                setArticleBody("");
                await load();
              }
            }}
            className="mt-3 rounded-lg border border-sky-700 bg-sky-500/10 px-4 py-2 text-sm text-sky-300 hover:bg-sky-500/20 disabled:opacity-40"
          >
            Создать статью
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
        <div className="border-b border-zinc-800 px-4 py-3 text-sm font-medium text-white">
          Разделы и статьи
        </div>
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Название</th>
              <th className="px-4 py-3 text-left font-medium">Тип</th>
              <th className="px-4 py-3 text-left font-medium">Аудитория</th>
              <th className="px-4 py-3 text-right font-medium">Просмотров</th>
              <th className="px-4 py-3 text-right font-medium">Действие</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {sections.length === 0 && articles.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-zinc-600">
                  Материалов нет
                </td>
              </tr>
            ) : null}
            {sections.map((s) => (
              <Row
                key={`s-${s.id}`}
                title={s.title}
                kind="раздел"
                audience={s.audience_name}
                views={null}
                published={s.is_published}
                busy={busy}
                onToggle={async () => {
                  const ok = await call(`kb/sections/${s.id}/publish`, {
                    method: "POST",
                    body: JSON.stringify({ publish: !s.is_published }),
                  });
                  if (ok) await load();
                }}
              />
            ))}
            {articles.map((a) => (
              <Row
                key={`a-${a.id}`}
                title={a.title}
                kind="статья"
                audience={a.audience_name}
                views={a.views}
                published={a.is_published}
                busy={busy}
                onToggle={async () => {
                  const ok = await call(`kb/articles/${a.id}/publish`, {
                    method: "POST",
                    body: JSON.stringify({ publish: !a.is_published }),
                  });
                  if (ok) await load();
                }}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({
  title,
  kind,
  audience,
  views,
  published,
  busy,
  onToggle,
}: {
  title: string;
  kind: string;
  audience: string | null;
  views: number | null;
  published: boolean;
  busy: boolean;
  onToggle: () => Promise<void>;
}) {
  return (
    <tr className="hover:bg-zinc-900/40">
      <td className="px-4 py-3 text-zinc-200">{title}</td>
      <td className="px-4 py-3 text-zinc-500">{kind}</td>
      <td className="px-4 py-3 text-zinc-400">
        {audience ?? <span className="text-rose-400">не выбрана</span>}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-zinc-400">{views ?? "—"}</td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onToggle()}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
        >
          {published ? "Снять" : "Опубликовать"}
        </button>
      </td>
    </tr>
  );
}
