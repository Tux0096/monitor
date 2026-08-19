import { audit } from "./admin.js";
import { benefitStats } from "./benefits.js";
import { getConfig } from "./config.js";
import { sql } from "./db/client.js";

/** Бонусы и база знаний в админке. */

// ── Бонусы ─────────────────────────────────────────────────────────────────

export async function listBenefitsAdmin() {
  return sql`
    SELECT b.id, b.title, b.kind, b.is_published, b.valid_from, b.valid_to,
           b.audience_id, a.name AS audience_name,
           s.code AS shared_code,
           (SELECT count(*) FROM cab_benefit_code c WHERE c.benefit_id = b.id)::int AS codes_total,
           (SELECT count(*) FROM cab_benefit_code c
             WHERE c.benefit_id = b.id AND c.issued_to_worker_id IS NULL)::int AS codes_free
    FROM cab_benefit b
    LEFT JOIN cab_audience a ON a.id = b.audience_id
    LEFT JOIN cab_benefit_shared s ON s.benefit_id = b.id
    ORDER BY b.created_at DESC
  `;
}

export async function upsertBenefit(
  input: {
    id?: number;
    title: string;
    descriptionMd: string;
    kind: "shared" | "personal";
    audienceId: number | null;
    sharedCode: string | null;
  },
  adminEmail: string,
): Promise<{ id: number }> {
  const id = await sql.begin(async (tx) => {
    const rows = input.id
      ? ((await tx`
          UPDATE cab_benefit
          SET title = ${input.title}, description_md = ${input.descriptionMd},
              kind = ${input.kind}, audience_id = ${input.audienceId}
          WHERE id = ${input.id} RETURNING id
        `) as Array<{ id: number }>)
      : ((await tx`
          INSERT INTO cab_benefit (title, description_md, kind, audience_id)
          VALUES (${input.title}, ${input.descriptionMd}, ${input.kind}, ${input.audienceId})
          RETURNING id
        `) as Array<{ id: number }>);

    const benefitId = rows[0].id;

    if (input.kind === "shared") {
      await tx`
        INSERT INTO cab_benefit_shared (benefit_id, code)
        VALUES (${benefitId}, ${input.sharedCode})
        ON CONFLICT (benefit_id) DO UPDATE SET code = EXCLUDED.code
      `;
    }
    return benefitId;
  });

  await audit(adminEmail, input.id ? "update" : "create", "benefit", id, {
    title: input.title,
    kind: input.kind,
  });
  return { id: id as number };
}

/**
 * Загрузка пула персональных кодов.
 *
 * Дубликаты внутри загрузки и уже существующие коды игнорируются:
 * повторная заливка того же файла не должна плодить копии, из-за
 * которых один код достался бы двум сотрудникам.
 */
export async function uploadBenefitCodes(
  benefitId: number,
  raw: string,
  adminEmail: string,
): Promise<{ added: number; skipped: number; total: number }> {
  const codes = Array.from(
    new Set(
      raw
        .split(/[\r\n,;]+/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && line.length <= 100),
    ),
  );

  if (codes.length === 0) return { added: 0, skipped: 0, total: 0 };

  let added = 0;
  await sql.begin(async (tx) => {
    for (const code of codes) {
      const inserted = (await tx`
        INSERT INTO cab_benefit_code (benefit_id, code)
        VALUES (${benefitId}, ${code})
        ON CONFLICT (benefit_id, code) DO NOTHING
        RETURNING id
      `) as Array<{ id: number }>;
      if (inserted.length > 0) added += 1;
    }
  });

  const stats = await benefitStats(benefitId);
  await audit(adminEmail, "upload_codes", "benefit", benefitId, {
    added,
    skipped: codes.length - added,
  });
  return { added, skipped: codes.length - added, total: stats.total };
}

export async function publishBenefit(
  benefitId: number,
  publish: boolean,
  adminEmail: string,
): Promise<{ ok: boolean; reason?: string }> {
  const rows = (await sql`
    SELECT b.kind, b.audience_id,
           (SELECT count(*) FROM cab_benefit_code c WHERE c.benefit_id = b.id)::int AS codes
    FROM cab_benefit b WHERE b.id = ${benefitId} LIMIT 1
  `) as Array<{ kind: string; audience_id: number | null; codes: number }>;
  const benefit = rows[0];
  if (!benefit) return { ok: false, reason: "бонус не найден" };

  if (publish) {
    if (benefit.audience_id == null) {
      return { ok: false, reason: "не выбрана аудитория: бонус никто не увидит" };
    }
    // Публиковать персональный бонус с пустым пулом бессмысленно: первый же
    // сотрудник получит «промокоды закончились» вместо кода.
    if (benefit.kind === "personal" && benefit.codes === 0) {
      return { ok: false, reason: "пул промокодов пуст — сначала загрузите коды" };
    }
  }

  await sql`UPDATE cab_benefit SET is_published = ${publish} WHERE id = ${benefitId}`;
  await audit(adminEmail, publish ? "publish" : "unpublish", "benefit", benefitId, null);
  return { ok: true };
}

export async function getBenefitStats(benefitId: number) {
  return benefitStats(benefitId);
}

// ── База знаний ────────────────────────────────────────────────────────────

export async function listKbAdmin() {
  const [sections, articles] = await Promise.all([
    sql`
      SELECT s.id, s.parent_id, s.title, s.slug, s.sort, s.is_published,
             s.audience_id, a.name AS audience_name
      FROM cab_kb_section s
      LEFT JOIN cab_audience a ON a.id = s.audience_id
      ORDER BY s.sort, s.title
    `,
    sql`
      SELECT ar.id, ar.section_id, ar.title, ar.slug, ar.is_published,
             ar.audience_id, a.name AS audience_name,
             (SELECT count(*) FROM cab_kb_view v WHERE v.article_id = ar.id)::int AS views
      FROM cab_kb_article ar
      LEFT JOIN cab_audience a ON a.id = ar.audience_id
      ORDER BY ar.updated_at DESC
    `,
  ]);
  return { sections, articles };
}

/** Транслитерация в slug: кириллица в URL выглядит нечитаемо после экранирования. */
function slugify(title: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
    и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
    с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch",
    ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  const slug = title
    .toLowerCase()
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || `item-${Date.now()}`;
}

export async function upsertKbSection(
  input: {
    id?: number;
    title: string;
    parentId: number | null;
    sort: number;
    audienceId: number | null;
  },
  adminEmail: string,
): Promise<{ id: number }> {
  const slug = slugify(input.title);
  const rows = input.id
    ? ((await sql`
        UPDATE cab_kb_section
        SET title = ${input.title}, parent_id = ${input.parentId},
            sort = ${input.sort}, audience_id = ${input.audienceId}, updated_at = now()
        WHERE id = ${input.id} RETURNING id
      `) as Array<{ id: number }>)
    : ((await sql`
        INSERT INTO cab_kb_section (title, slug, parent_id, sort, audience_id)
        VALUES (${input.title}, ${slug}, ${input.parentId}, ${input.sort}, ${input.audienceId})
        RETURNING id
      `) as Array<{ id: number }>);

  await audit(adminEmail, input.id ? "update" : "create", "kb_section", rows[0].id, {
    title: input.title,
  });
  return { id: rows[0].id };
}

export async function upsertKbArticle(
  input: {
    id?: number;
    sectionId: number | null;
    title: string;
    bodyMd: string;
    audienceId: number | null;
  },
  adminEmail: string,
): Promise<{ id: number }> {
  const slug = slugify(input.title);
  const rows = input.id
    ? ((await sql`
        UPDATE cab_kb_article
        SET title = ${input.title}, body_md = ${input.bodyMd},
            section_id = ${input.sectionId}, audience_id = ${input.audienceId},
            version = version + 1, updated_at = now()
        WHERE id = ${input.id} RETURNING id
      `) as Array<{ id: number }>)
    : ((await sql`
        INSERT INTO cab_kb_article (section_id, slug, title, body_md, audience_id, created_by)
        VALUES (${input.sectionId}, ${slug}, ${input.title}, ${input.bodyMd},
                ${input.audienceId}, ${adminEmail})
        RETURNING id
      `) as Array<{ id: number }>);

  await audit(adminEmail, input.id ? "update" : "create", "kb_article", rows[0].id, {
    title: input.title,
  });
  return { id: rows[0].id };
}

export async function publishKb(
  kind: "section" | "article",
  id: number,
  publish: boolean,
  adminEmail: string,
): Promise<{ ok: boolean; reason?: string }> {
  const table = kind === "section" ? "cab_kb_section" : "cab_kb_article";

  if (publish) {
    const rows = (await sql`
      SELECT audience_id FROM ${sql.unsafe(table)} WHERE id = ${id} LIMIT 1
    `) as Array<{ audience_id: number | null }>;
    if (!rows[0]) return { ok: false, reason: "не найдено" };
    if (rows[0].audience_id == null) {
      return { ok: false, reason: "не выбрана аудитория: материал никто не увидит" };
    }
  }

  if (kind === "article") {
    await sql`
      UPDATE cab_kb_article
      SET is_published = ${publish},
          published_at = CASE WHEN ${publish} THEN coalesce(published_at, now()) ELSE published_at END
      WHERE id = ${id}
    `;
  } else {
    await sql`UPDATE cab_kb_section SET is_published = ${publish} WHERE id = ${id}`;
  }

  await audit(adminEmail, publish ? "publish" : "unpublish", `kb_${kind}`, id, null);
  return { ok: true };
}

// ── Пуш о новости ──────────────────────────────────────────────────────────

/**
 * Уведомление о новости через существующий push-сервис.
 *
 * Отдельным действием после публикации, а не автоматически: редактор
 * должен решать сам, дёргать ли людей. Повторная отправка блокируется
 * отметкой push_sent_at — иначе правка опечатки разошлёт пуш второй раз.
 *
 * Ссылка ведёт на deep-link Mini App: startapp=news_<id> открывает
 * сразу нужный экран, а не главную.
 */
export async function sendNewsPush(
  newsId: number,
  adminEmail: string,
): Promise<{ ok: boolean; reason?: string; sent?: number }> {
  const rows = (await sql`
    SELECT title, lead, is_published, push_sent_at FROM cab_news WHERE id = ${newsId} LIMIT 1
  `) as Array<{
    title: string;
    lead: string | null;
    is_published: boolean;
    push_sent_at: string | null;
  }>;
  const news = rows[0];
  if (!news) return { ok: false, reason: "новость не найдена" };
  if (!news.is_published) return { ok: false, reason: "новость не опубликована" };
  if (news.push_sent_at) return { ok: false, reason: "уведомление уже отправлялось" };

  const config = getConfig();
  const pushUrl = process.env.PUSH_SERVICE_URL?.trim() || "http://monitor-push-service:3103";

  try {
    const response = await fetch(`${pushUrl}/push/v1/notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-monitor-import-secret": config.serviceSecret ?? "",
      },
      body: JSON.stringify({
        title: news.title,
        body: news.lead || "Новое объявление в личном кабинете",
        url: `${config.miniappPublicUrl}?startapp=news_${newsId}`,
        domain: "dashboard",
        dedupeKey: `cabinet:news:${newsId}`,
        cooldownMinutes: 0,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return { ok: false, reason: `push-сервис ответил ${response.status}: ${text.slice(0, 120)}` };
    }

    const result = (await response.json().catch(() => ({}))) as { sent?: number };
    await sql`UPDATE cab_news SET push_sent_at = now() WHERE id = ${newsId}`;
    await audit(adminEmail, "push", "news", newsId, { sent: result.sent ?? 0 });
    return { ok: true, sent: result.sent ?? 0 };
  } catch (error) {
    return {
      ok: false,
      reason: `push-сервис недоступен: ${error instanceof Error ? error.message : error}`,
    };
  }
}
