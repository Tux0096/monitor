import { visibleTo, type WorkerScopeDb } from "./audience-db.js";
import { sql } from "./db/client.js";

/**
 * Ленты новостей, базы знаний и бонусов.
 *
 * Везде отбор по аудитории идёт в SQL, а не после выборки: скрытая статья
 * не должна доезжать до фронта ни в каком виде — ни в теле ответа,
 * ни в счётчике, ни в заголовке.
 *
 * Пагинация keyset по (publish_at, id): при появлении новой записи
 * страницы не съезжают, в отличие от offset.
 */

export type Cursor = { key: string; id: number } | null;

export function encodeCursor(key: string | null, id: number): string {
  return Buffer.from(JSON.stringify({ k: key, i: id })).toString("base64url");
}

export function decodeCursor(raw: string | null | undefined): Cursor {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString()) as {
      k: string | null;
      i: number;
    };
    return { key: parsed.k ?? "", id: Number(parsed.i) };
  } catch {
    // Битый курсор — отдаём первую страницу вместо ошибки:
    // ломать ленту из-за испорченной ссылки незачем.
    return null;
  }
}

export async function listNews(worker: WorkerScopeDb, limit: number, cursor: string | null) {
  const after = decodeCursor(cursor);
  const rows = (await sql`
    SELECT n.id, n.title, n.lead, n.cover_key, n.publish_at,
           (r.worker_id IS NOT NULL) AS is_read
    FROM cab_news n
    LEFT JOIN cab_news_read r
      ON r.news_id = n.id AND r.worker_id = ${(worker as { workerId?: number }).workerId ?? 0}
    WHERE n.is_published
      AND (n.publish_at IS NULL OR n.publish_at <= now())
      AND ${visibleTo("n.audience_id", worker)}
      AND (
        ${after === null}
        OR (n.publish_at, n.id) < (${after?.key ?? null}::timestamptz, ${after?.id ?? 0})
      )
    ORDER BY n.publish_at DESC NULLS LAST, n.id DESC
    LIMIT ${limit + 1}
  `) as Array<{
    id: number;
    title: string;
    lead: string | null;
    cover_key: string | null;
    publish_at: string | null;
    is_read: boolean;
  }>;

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(last.publish_at, last.id) : null,
  };
}

export async function getNews(id: number, worker: WorkerScopeDb) {
  const rows = (await sql`
    SELECT n.id, n.title, n.lead, n.body_md, n.cover_key, n.publish_at
    FROM cab_news n
    WHERE n.id = ${id}
      AND n.is_published
      AND (n.publish_at IS NULL OR n.publish_at <= now())
      AND ${visibleTo("n.audience_id", worker)}
    LIMIT 1
  `) as Array<Record<string, unknown>>;
  return rows[0] ?? null;
}

export async function markNewsRead(newsId: number, workerId: number): Promise<void> {
  await sql`
    INSERT INTO cab_news_read (news_id, worker_id)
    VALUES (${newsId}, ${workerId})
    ON CONFLICT (news_id, worker_id) DO NOTHING
  `;
}

/** Дерево разделов БЗ, доступных сотруднику. */
export async function listKbSections(worker: WorkerScopeDb) {
  return (await sql`
    SELECT s.id, s.parent_id, s.slug, s.title, s.sort,
           (SELECT count(*) FROM cab_kb_article a
             WHERE a.section_id = s.id AND a.is_published
               AND ${visibleTo("a.audience_id", worker)})::int AS articles
    FROM cab_kb_section s
    WHERE s.is_published AND ${visibleTo("s.audience_id", worker)}
    ORDER BY s.sort, s.title
  `) as Array<Record<string, unknown>>;
}

export async function listKbArticles(
  sectionId: number,
  worker: WorkerScopeDb,
  limit: number,
  cursor: string | null,
) {
  const after = decodeCursor(cursor);
  const rows = (await sql`
    SELECT a.id, a.slug, a.title, a.cover_key, a.published_at
    FROM cab_kb_article a
    WHERE a.section_id = ${sectionId}
      AND a.is_published
      AND ${visibleTo("a.audience_id", worker)}
      AND (
        ${after === null}
        OR (a.published_at, a.id) < (${after?.key ?? null}::timestamptz, ${after?.id ?? 0})
      )
    ORDER BY a.published_at DESC NULLS LAST, a.id DESC
    LIMIT ${limit + 1}
  `) as Array<{ id: number; published_at: string | null } & Record<string, unknown>>;

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(last.published_at, last.id) : null,
  };
}

export async function getKbArticle(id: number, worker: WorkerScopeDb) {
  const rows = (await sql`
    SELECT a.id, a.slug, a.title, a.body_md, a.cover_key, a.published_at, a.version
    FROM cab_kb_article a
    WHERE a.id = ${id} AND a.is_published AND ${visibleTo("a.audience_id", worker)}
    LIMIT 1
  `) as Array<Record<string, unknown>>;
  if (!rows[0]) return null;

  const attachments = (await sql`
    SELECT id, file_key, file_name, mime, size
    FROM cab_kb_attachment WHERE article_id = ${id} ORDER BY sort, id
  `) as Array<Record<string, unknown>>;

  return { ...rows[0], attachments };
}

export async function markKbViewed(articleId: number, workerId: number): Promise<void> {
  await sql`
    INSERT INTO cab_kb_view (article_id, worker_id)
    VALUES (${articleId}, ${workerId})
    ON CONFLICT (article_id, worker_id) DO NOTHING
  `;
}

/** Полнотекстовый поиск по русской конфигурации — с учётом словоформ. */
export async function searchKb(query: string, worker: WorkerScopeDb, limit: number) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { items: [] };

  const items = (await sql`
    SELECT a.id, a.title, a.section_id,
           ts_headline('russian', a.body_md, plainto_tsquery('russian', ${trimmed}),
                       'MaxWords=20, MinWords=5, ShortWord=3') AS excerpt
    FROM cab_kb_article a
    WHERE a.is_published
      AND ${visibleTo("a.audience_id", worker)}
      AND to_tsvector('russian', coalesce(a.title, '') || ' ' || coalesce(a.body_md, ''))
          @@ plainto_tsquery('russian', ${trimmed})
    ORDER BY ts_rank(
      to_tsvector('russian', coalesce(a.title, '') || ' ' || coalesce(a.body_md, '')),
      plainto_tsquery('russian', ${trimmed})
    ) DESC
    LIMIT ${limit}
  `) as Array<Record<string, unknown>>;

  return { items };
}

export async function listBenefits(worker: WorkerScopeDb, workerId: number) {
  return (await sql`
    SELECT b.id, b.title, b.description_md, b.image_key, b.kind,
           b.valid_from, b.valid_to,
           s.code AS shared_code,
           i.code_id IS NOT NULL AS claimed,
           c.code AS personal_code,
           (SELECT count(*) FROM cab_benefit_code fc
             WHERE fc.benefit_id = b.id AND fc.issued_to_worker_id IS NULL)::int AS free_codes
    FROM cab_benefit b
    LEFT JOIN cab_benefit_shared s ON s.benefit_id = b.id
    LEFT JOIN cab_benefit_issue i ON i.benefit_id = b.id AND i.worker_id = ${workerId}
    LEFT JOIN cab_benefit_code c ON c.id = i.code_id
    WHERE b.is_published
      AND (b.valid_from IS NULL OR b.valid_from <= now())
      AND (b.valid_to IS NULL OR b.valid_to >= now())
      AND ${visibleTo("b.audience_id", worker)}
    ORDER BY b.created_at DESC
  `) as Array<Record<string, unknown>>;
}
