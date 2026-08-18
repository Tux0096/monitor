import { getCRMReader } from "./crm/index.js";
import { sql } from "./db/client.js";

/**
 * Админ-операции кабинета.
 *
 * Каждое изменяющее действие пишет в cab_admin_audit: кто, что и когда.
 * Без этого нельзя ответить на вопрос «почему у сотрудника появился
 * доступ к разделу», а он рано или поздно задаётся.
 */

export async function audit(
  adminEmail: string,
  action: string,
  entity: string,
  entityId: string | number | null,
  payload: unknown = null,
): Promise<void> {
  await sql`
    INSERT INTO cab_admin_audit (admin_email, action, entity, entity_id, payload)
    VALUES (${adminEmail}, ${action}, ${entity}, ${entityId == null ? null : String(entityId)},
            ${payload == null ? null : JSON.stringify(payload)}::jsonb)
  `;
}

// ── Справочники ────────────────────────────────────────────────────────────

/**
 * Синхронизация справочников из CRM.
 *
 * Копируем должности, точки и компании к себе, чтобы админка могла
 * настраивать аудитории без обращения к чужой базе на каждый клик,
 * и чтобы названия не пропадали, если CRM недоступна.
 */
export async function syncRefs(adminEmail: string): Promise<{
  posts: number;
  departments: number;
  companies: number;
}> {
  const crm = getCRMReader();
  const [posts, departments, companies] = await Promise.all([
    crm.listPosts(),
    crm.listDepartments(),
    crm.listCompanies(),
  ]);

  await sql.begin(async (tx) => {
    for (const post of posts) {
      await tx`
        INSERT INTO cab_ref_post (id, name, synced_at) VALUES (${post.id}, ${post.name}, now())
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, synced_at = now()
      `;
    }
    for (const dept of departments) {
      await tx`
        INSERT INTO cab_ref_department (id, name, company_id, city, synced_at)
        VALUES (${dept.id}, ${dept.name}, ${dept.companyId}, ${dept.city}, now())
        ON CONFLICT (id) DO UPDATE
          SET name = EXCLUDED.name, company_id = EXCLUDED.company_id,
              city = EXCLUDED.city, synced_at = now()
      `;
    }
    for (const company of companies) {
      await tx`
        INSERT INTO cab_ref_company (id, name, synced_at)
        VALUES (${company.id}, ${company.name}, now())
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, synced_at = now()
      `;
    }
  });

  await audit(adminEmail, "sync", "refs", null, {
    posts: posts.length,
    departments: departments.length,
    companies: companies.length,
  });

  return {
    posts: posts.length,
    departments: departments.length,
    companies: companies.length,
  };
}

export async function listRefs() {
  const [posts, departments, companies] = await Promise.all([
    sql`SELECT id, name FROM cab_ref_post ORDER BY name`,
    sql`SELECT id, name, city, company_id FROM cab_ref_department ORDER BY city NULLS LAST, name`,
    sql`SELECT id, name FROM cab_ref_company ORDER BY name`,
  ]);
  return { posts, departments, companies };
}

// ── Заявки на привязку ─────────────────────────────────────────────────────

export async function listLinkRequests(status: string | null) {
  return sql`
    SELECT id, telegram_id::text, phone, tg_first_name, tg_username,
           status, created_at, decided_by, decided_at, comment
    FROM cab_link_request
    WHERE (${status}::text IS NULL OR status = ${status}::text)
    ORDER BY created_at DESC
    LIMIT 200
  `;
}

/**
 * Подтверждение заявки. Администратор указывает, какому сотруднику
 * соответствует Telegram-аккаунт: автоматика здесь не сработала,
 * поэтому решение принимает человек.
 */
export async function approveLinkRequest(
  requestId: number,
  workerId: number,
  adminEmail: string,
): Promise<{ ok: boolean; reason?: string }> {
  const rows = (await sql`
    SELECT telegram_id, status FROM cab_link_request WHERE id = ${requestId} LIMIT 1
  `) as Array<{ telegram_id: string; status: string }>;
  const request = rows[0];
  if (!request) return { ok: false, reason: "заявка не найдена" };
  if (request.status !== "pending") return { ok: false, reason: "заявка уже обработана" };

  // Сверяем, что такой сотрудник вообще есть и действующий: подтвердить
  // привязку к уволенному или несуществующему id нельзя.
  const worker = await getCRMReader().getWorkerById(workerId);
  if (!worker) return { ok: false, reason: "сотрудник не найден в CRM" };
  if (!worker.isActive) return { ok: false, reason: "сотрудник не числится действующим" };

  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO cab_app_user (worker_id, telegram_id, linked_by, last_seen_at)
      VALUES (${workerId}, ${request.telegram_id}, ${adminEmail}, now())
      ON CONFLICT (telegram_id) DO UPDATE
        SET worker_id = EXCLUDED.worker_id, linked_by = EXCLUDED.linked_by,
            disabled_at = NULL
    `;
    await tx`
      UPDATE cab_link_request
      SET status = 'approved', decided_by = ${adminEmail}, decided_at = now()
      WHERE id = ${requestId}
    `;
  });

  await audit(adminEmail, "approve", "link_request", requestId, { workerId });
  return { ok: true };
}

export async function rejectLinkRequest(
  requestId: number,
  adminEmail: string,
  comment: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  const result = (await sql`
    UPDATE cab_link_request
    SET status = 'rejected', decided_by = ${adminEmail}, decided_at = now(),
        comment = ${comment}
    WHERE id = ${requestId} AND status = 'pending'
    RETURNING id
  `) as Array<{ id: number }>;
  if (result.length === 0) return { ok: false, reason: "заявка не найдена или уже обработана" };
  await audit(adminEmail, "reject", "link_request", requestId, { comment });
  return { ok: true };
}

// ── Аудитории ──────────────────────────────────────────────────────────────

export async function listAudiences() {
  return sql`
    SELECT a.id, a.name, a.is_everyone, a.created_at,
           coalesce(json_agg(
             json_build_object(
               'ruleId', r.id,
               'posts', (SELECT coalesce(json_agg(rp.post_id), '[]'::json)
                          FROM cab_audience_rule_post rp WHERE rp.rule_id = r.id),
               'departments', (SELECT coalesce(json_agg(rd.department_id), '[]'::json)
                          FROM cab_audience_rule_department rd WHERE rd.rule_id = r.id)
             )
           ) FILTER (WHERE r.id IS NOT NULL), '[]'::json) AS rules
    FROM cab_audience a
    LEFT JOIN cab_audience_rule r ON r.audience_id = a.id
    GROUP BY a.id
    ORDER BY a.created_at DESC
  `;
}

export async function createAudience(
  input: {
    name: string;
    isEveryone: boolean;
    rules: Array<{ postIds: number[]; departmentIds: number[] }>;
  },
  adminEmail: string,
): Promise<{ id: number }> {
  const id = await sql.begin(async (tx) => {
    const [audience] = (await tx`
      INSERT INTO cab_audience (name, is_everyone)
      VALUES (${input.name}, ${input.isEveryone})
      RETURNING id
    `) as Array<{ id: number }>;

    for (const rule of input.rules) {
      const [created] = (await tx`
        INSERT INTO cab_audience_rule (audience_id) VALUES (${audience.id}) RETURNING id
      `) as Array<{ id: number }>;
      for (const postId of rule.postIds) {
        await tx`
          INSERT INTO cab_audience_rule_post (rule_id, post_id)
          VALUES (${created.id}, ${postId}) ON CONFLICT DO NOTHING
        `;
      }
      for (const departmentId of rule.departmentIds) {
        await tx`
          INSERT INTO cab_audience_rule_department (rule_id, department_id)
          VALUES (${created.id}, ${departmentId}) ON CONFLICT DO NOTHING
        `;
      }
    }
    return audience.id;
  });

  await audit(adminEmail, "create", "audience", id, input);
  return { id: id as number };
}

// ── Новости ────────────────────────────────────────────────────────────────

export async function listNewsAdmin() {
  return sql`
    SELECT n.id, n.title, n.lead, n.is_published, n.publish_at, n.audience_id,
           a.name AS audience_name,
           (SELECT count(*) FROM cab_news_read r WHERE r.news_id = n.id)::int AS reads
    FROM cab_news n
    LEFT JOIN cab_audience a ON a.id = n.audience_id
    ORDER BY n.updated_at DESC
    LIMIT 200
  `;
}

export async function upsertNews(
  input: {
    id?: number;
    title: string;
    lead: string | null;
    bodyMd: string;
    audienceId: number | null;
  },
  adminEmail: string,
): Promise<{ id: number }> {
  const rows = input.id
    ? ((await sql`
        UPDATE cab_news
        SET title = ${input.title}, lead = ${input.lead}, body_md = ${input.bodyMd},
            audience_id = ${input.audienceId}, updated_at = now()
        WHERE id = ${input.id}
        RETURNING id
      `) as Array<{ id: number }>)
    : ((await sql`
        INSERT INTO cab_news (title, lead, body_md, audience_id, created_by)
        VALUES (${input.title}, ${input.lead}, ${input.bodyMd}, ${input.audienceId}, ${adminEmail})
        RETURNING id
      `) as Array<{ id: number }>);

  await audit(adminEmail, input.id ? "update" : "create", "news", rows[0].id, {
    title: input.title,
  });
  return { id: rows[0].id };
}

/** Публикация. Отдельным действием: черновик не должен уехать случайно. */
export async function publishNews(
  newsId: number,
  adminEmail: string,
): Promise<{ ok: boolean; reason?: string }> {
  const rows = (await sql`
    SELECT audience_id FROM cab_news WHERE id = ${newsId} LIMIT 1
  `) as Array<{ audience_id: number | null }>;
  if (!rows[0]) return { ok: false, reason: "новость не найдена" };

  // Без аудитории новость не увидит никто — публиковать бессмысленно,
  // и молчаливая публикация в пустоту хуже явной ошибки.
  if (rows[0].audience_id == null) {
    return { ok: false, reason: "не выбрана аудитория: новость никто не увидит" };
  }

  await sql`
    UPDATE cab_news SET is_published = true, publish_at = coalesce(publish_at, now())
    WHERE id = ${newsId}
  `;
  await audit(adminEmail, "publish", "news", newsId, null);
  return { ok: true };
}

export async function unpublishNews(newsId: number, adminEmail: string): Promise<void> {
  await sql`UPDATE cab_news SET is_published = false WHERE id = ${newsId}`;
  await audit(adminEmail, "unpublish", "news", newsId, null);
}

export async function listAudit(limit = 100) {
  return sql`
    SELECT id, admin_email, action, entity, entity_id, payload, created_at
    FROM cab_admin_audit ORDER BY created_at DESC LIMIT ${limit}
  `;
}
