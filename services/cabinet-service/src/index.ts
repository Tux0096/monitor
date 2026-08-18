import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";

import { InvalidInitData, verifyInitData } from "./auth/init-data.js";
import { normalizePhone, phonesMatch } from "./auth/phone.js";
import {
  RefreshReuseDetected,
  issueTokens,
  revokeRefresh,
  rotateRefresh,
  verifyAccess,
  type SessionClaims,
} from "./auth/sessions.js";
import {
  approveLinkRequest,
  createAudience,
  listAudiences,
  listAudit,
  listLinkRequests,
  listNewsAdmin,
  listRefs,
  publishNews,
  rejectLinkRequest,
  syncRefs,
  unpublishNews,
  upsertNews,
} from "./admin.js";
import { getConfig } from "./config.js";
import { getCRMReader, verifyCRMOnStartup } from "./crm/index.js";
import { BenefitNotAvailable, PoolExhausted, claimBenefit } from "./benefits.js";
import {
  getKbArticle,
  getNews,
  listBenefits,
  listKbArticles,
  listKbSections,
  listNews,
  markKbViewed,
  markNewsRead,
  searchKb,
} from "./content.js";
import { sql } from "./db/client.js";

/** Ошибки в application/problem+json с машиночитаемым code (§8). */
function problem(
  reply: { status: (code: number) => { type: (t: string) => { send: (b: unknown) => unknown } } },
  status: number,
  code: string,
  detail: string,
) {
  return reply
    .status(status)
    .type("application/problem+json")
    .send({ type: `about:blank#${code}`, title: code, status, detail, code });
}

async function findOrCreateAppUser(
  telegramId: number,
  workerId: number,
  linkedBy: string,
): Promise<number> {
  const rows = (await sql`
    INSERT INTO cab_app_user (worker_id, telegram_id, linked_by, last_seen_at)
    VALUES (${workerId}, ${telegramId}, ${linkedBy}, now())
    ON CONFLICT (telegram_id) DO UPDATE
      SET last_seen_at = now(), worker_id = EXCLUDED.worker_id
    RETURNING id
  `) as Array<{ id: number }>;
  return rows[0].id;
}

export async function buildApp() {
  const config = getConfig();
  const app = Fastify({ logger: true, bodyLimit: 64 * 1024 });

  await app.register(cors, {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      callback(null, config.allowedOrigins.some((allowed) => origin.startsWith(allowed)));
    },
    credentials: false,
  });

  // Rate-limit на /auth/* — обязателен по §12: без него подбор
  // и заваливание заявками на привязку ничем не ограничены.
  await app.register(rateLimit, { max: 60, timeWindow: "1 minute" });

  app.get("/health", async () => ({
    status: "ok",
    service: "cabinet-service",
    version: "0.1.0",
    crmSource: config.crmSource,
  }));

  /** Результат контрактной проверки схемы CRM (§1.2). */
  app.get("/healthz/crm", async () => getCRMReader().healthcheck());

  // ── Аутентификация ─────────────────────────────────────────────────────

  app.post("/api/v1/auth/telegram", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = (req.body ?? {}) as { init_data?: string };
      let verified;
      try {
        verified = verifyInitData(
          body.init_data ?? "",
          config.botToken,
          config.initDataMaxAgeSec,
        );
      } catch (error) {
        const reason = error instanceof InvalidInitData ? error.reason : "invalid";
        return problem(reply, 401, "invalid_init_data", reason);
      }

      const telegramId = verified.user.id;
      const crm = getCRMReader();

      const existing = (await sql`
        SELECT id, worker_id, disabled_at FROM cab_app_user
        WHERE telegram_id = ${telegramId} LIMIT 1
      `) as Array<{ id: number; worker_id: number; disabled_at: string | null }>;

      let workerId: number;
      let appUserId: number;

      if (existing[0]) {
        if (existing[0].disabled_at) {
          return problem(reply, 403, "user_disabled", "доступ отключён администратором");
        }
        workerId = existing[0].worker_id;
        appUserId = existing[0].id;
      } else {
        const worker = await crm.getWorkerByTelegramId(telegramId);
        if (!worker) {
          return problem(reply, 409, "link_required", "нужна привязка по номеру телефона");
        }
        workerId = worker.workerId;
        appUserId = await findOrCreateAppUser(telegramId, workerId, "telegram_id");
      }

      // Проверка на каждом входе, а не только при первой привязке:
      // уволенный не должен сохранять доступ (§12).
      const card = await crm.getWorkerById(workerId);
      if (!card || !card.isActive) {
        return problem(reply, 403, "worker_inactive", "сотрудник не числится действующим");
      }

      await sql`UPDATE cab_app_user SET last_seen_at = now() WHERE id = ${appUserId}`;

      const tokens = await issueTokens(
        { appUserId, workerId, telegramId },
        (req.headers["user-agent"] as string | undefined) ?? null,
      );
      return { ...tokens, profile: card, startParam: verified.startParam };
    },
  );

  app.post("/api/v1/auth/link/contact",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (req, reply) => {
      const body = (req.body ?? {}) as {
        init_data?: string;
        contact?: { phone_number?: string; user_id?: number };
      };

      let verified;
      try {
        verified = verifyInitData(body.init_data ?? "", config.botToken, config.initDataMaxAgeSec);
      } catch (error) {
        const reason = error instanceof InvalidInitData ? error.reason : "invalid";
        return problem(reply, 401, "invalid_init_data", reason);
      }

      const telegramId = verified.user.id;
      const phone = normalizePhone(body.contact?.phone_number);
      if (!phone) return problem(reply, 400, "no_phone", "контакт не содержит номера");

      // Телефон приходит от Telegram из аккаунта пользователя, руками
      // его не вводят. Но контакт можно переслать чужой, поэтому сверяем
      // user_id из контакта с тем, кто открыл приложение.
      if (body.contact?.user_id != null && body.contact.user_id !== telegramId) {
        return problem(reply, 400, "foreign_contact", "контакт принадлежит другому аккаунту");
      }

      const crm = getCRMReader();
      const worker = await crm.getWorkerByPhone(phone);

      if (worker && worker.isActive && phonesMatch(worker.phone, phone)) {
        const appUserId = await findOrCreateAppUser(telegramId, worker.workerId, "contact");
        const tokens = await issueTokens(
          { appUserId, workerId: worker.workerId, telegramId },
          (req.headers["user-agent"] as string | undefined) ?? null,
        );
        return { ...tokens, profile: worker };
      }

      await sql`
        INSERT INTO cab_link_request (telegram_id, phone, tg_first_name, tg_username, status)
        VALUES (${telegramId}, ${phone}, ${verified.user.first_name ?? null},
                ${verified.user.username ?? null}, 'pending')
      `;
      return reply.status(202).send({
        status: "pending",
        code: "link_request_created",
        detail: "заявка отправлена администратору",
      });
    },
  );

  app.post("/api/v1/auth/refresh", async (req, reply) => {
    const body = (req.body ?? {}) as { refresh?: string };
    if (!body.refresh) return problem(reply, 400, "no_refresh", "refresh не передан");
    try {
      return await rotateRefresh(
        body.refresh,
        (req.headers["user-agent"] as string | undefined) ?? null,
      );
    } catch (error) {
      if (error instanceof RefreshReuseDetected) {
        return problem(reply, 401, "refresh_reuse", "сессии сброшены, войдите заново");
      }
      return problem(reply, 401, "invalid_refresh", "refresh недействителен");
    }
  });

  app.post("/api/v1/auth/logout", async (req) => {
    const body = (req.body ?? {}) as { refresh?: string };
    if (body.refresh) await revokeRefresh(body.refresh);
    return { status: "ok" };
  });

  // ── Кабинет ────────────────────────────────────────────────────────────

  async function requireSession(
    req: { headers: Record<string, unknown> },
  ): Promise<SessionClaims | null> {
    const header = String(req.headers.authorization ?? "");
    if (!header.startsWith("Bearer ")) return null;
    try {
      return await verifyAccess(header.slice(7));
    } catch {
      return null;
    }
  }

  app.get("/api/v1/me", async (req, reply) => {
    const claims = await requireSession(req);
    if (!claims) return problem(reply, 401, "unauthorized", "нужен access-токен");

    const crm = getCRMReader();
    const card = await crm.getWorkerById(claims.workerId);
    if (!card) return problem(reply, 404, "worker_not_found", "сотрудник не найден в CRM");
    if (!card.isActive) {
      return problem(reply, 403, "worker_inactive", "сотрудник не числится действующим");
    }

    const chief = await crm.getChief(claims.workerId);
    const extra = (await sql`
      SELECT photo_key, about FROM cab_profile_extra WHERE worker_id = ${claims.workerId} LIMIT 1
    `) as Array<{ photo_key: string | null; about: string | null }>;

    return {
      ...card,
      chief,
      photoKey: extra[0]?.photo_key ?? null,
      about: extra[0]?.about ?? null,
    };
  });

  app.get("/api/v1/me/logins", async (req, reply) => {
    const claims = await requireSession(req);
    if (!claims) return problem(reply, 401, "unauthorized", "нужен access-токен");
    return (await getCRMReader().getWorkerLogins(claims.workerId)) ?? {};
  });

  app.get("/api/v1/me/material-values", async (req, reply) => {
    const claims = await requireSession(req);
    if (!claims) return problem(reply, 401, "unauthorized", "нужен access-токен");
    return { items: await getCRMReader().getMaterialValues(claims.workerId) };
  });

  app.get("/api/v1/me/worktimes", async (req, reply) => {
    const claims = await requireSession(req);
    if (!claims) return problem(reply, 401, "unauthorized", "нужен access-токен");
    const query = req.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(Number(query.limit) || 30, 1), 100);
    return getCRMReader().getWorktimes(claims.workerId, limit, query.cursor ?? null);
  });

  // ── Контент ────────────────────────────────────────────────────────────

  /**
   * Область видимости сотрудника. Берётся из CRM на каждый запрос, а не
   * из токена: перевод на другую точку должен менять доступ сразу,
   * а не после истечения access-токена.
   */
  async function workerScope(claims: SessionClaims) {
    const card = await getCRMReader().getWorkerById(claims.workerId);
    if (!card || !card.isActive) return null;
    return {
      workerId: card.workerId,
      postId: card.postId,
      departmentId: card.departmentId,
    };
  }

  app.get("/api/v1/news", async (req, reply) => {
    const claims = await requireSession(req);
    if (!claims) return problem(reply, 401, "unauthorized", "нужен access-токен");
    const scope = await workerScope(claims);
    if (!scope) return problem(reply, 403, "worker_inactive", "сотрудник не числится действующим");
    const q = req.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(Number(q.limit) || 20, 1), 50);
    return listNews(scope, limit, q.cursor ?? null);
  });

  app.get("/api/v1/news/:id", async (req, reply) => {
    const claims = await requireSession(req);
    if (!claims) return problem(reply, 401, "unauthorized", "нужен access-токен");
    const scope = await workerScope(claims);
    if (!scope) return problem(reply, 403, "worker_inactive", "сотрудник не числится действующим");
    const id = Number((req.params as { id: string }).id);
    const item = await getNews(id, scope);
    // 404, а не 403: существование скрытой новости не подтверждаем.
    if (!item) return problem(reply, 404, "not_found", "новость не найдена");
    return item;
  });

  app.post("/api/v1/news/:id/read", async (req, reply) => {
    const claims = await requireSession(req);
    if (!claims) return problem(reply, 401, "unauthorized", "нужен access-токен");
    const scope = await workerScope(claims);
    if (!scope) return problem(reply, 403, "worker_inactive", "сотрудник не числится действующим");
    const id = Number((req.params as { id: string }).id);
    // Отметить прочитанной можно только то, что доступно.
    if (!(await getNews(id, scope))) {
      return problem(reply, 404, "not_found", "новость не найдена");
    }
    await markNewsRead(id, claims.workerId);
    return { status: "ok" };
  });

  app.get("/api/v1/kb/sections", async (req, reply) => {
    const claims = await requireSession(req);
    if (!claims) return problem(reply, 401, "unauthorized", "нужен access-токен");
    const scope = await workerScope(claims);
    if (!scope) return problem(reply, 403, "worker_inactive", "сотрудник не числится действующим");
    return { items: await listKbSections(scope) };
  });

  app.get("/api/v1/kb/sections/:id/articles", async (req, reply) => {
    const claims = await requireSession(req);
    if (!claims) return problem(reply, 401, "unauthorized", "нужен access-токен");
    const scope = await workerScope(claims);
    if (!scope) return problem(reply, 403, "worker_inactive", "сотрудник не числится действующим");
    const q = req.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(Number(q.limit) || 20, 1), 50);
    return listKbArticles(Number((req.params as { id: string }).id), scope, limit, q.cursor ?? null);
  });

  app.get("/api/v1/kb/articles/:id", async (req, reply) => {
    const claims = await requireSession(req);
    if (!claims) return problem(reply, 401, "unauthorized", "нужен access-токен");
    const scope = await workerScope(claims);
    if (!scope) return problem(reply, 403, "worker_inactive", "сотрудник не числится действующим");
    const item = await getKbArticle(Number((req.params as { id: string }).id), scope);
    if (!item) return problem(reply, 404, "not_found", "статья не найдена");
    return item;
  });

  app.post("/api/v1/kb/articles/:id/view", async (req, reply) => {
    const claims = await requireSession(req);
    if (!claims) return problem(reply, 401, "unauthorized", "нужен access-токен");
    const scope = await workerScope(claims);
    if (!scope) return problem(reply, 403, "worker_inactive", "сотрудник не числится действующим");
    const id = Number((req.params as { id: string }).id);
    if (!(await getKbArticle(id, scope))) {
      return problem(reply, 404, "not_found", "статья не найдена");
    }
    await markKbViewed(id, claims.workerId);
    return { status: "ok" };
  });

  app.get("/api/v1/kb/search", async (req, reply) => {
    const claims = await requireSession(req);
    if (!claims) return problem(reply, 401, "unauthorized", "нужен access-токен");
    const scope = await workerScope(claims);
    if (!scope) return problem(reply, 403, "worker_inactive", "сотрудник не числится действующим");
    const q = req.query as Record<string, string | undefined>;
    return searchKb(q.q ?? "", scope, Math.min(Number(q.limit) || 20, 50));
  });

  app.get("/api/v1/benefits", async (req, reply) => {
    const claims = await requireSession(req);
    if (!claims) return problem(reply, 401, "unauthorized", "нужен access-токен");
    const scope = await workerScope(claims);
    if (!scope) return problem(reply, 403, "worker_inactive", "сотрудник не числится действующим");
    return { items: await listBenefits(scope, claims.workerId) };
  });

  /**
   * Выдача персонального промокода. Идемпотентна по паре (бонус, сотрудник):
   * двойной клик возвращает тот же код.
   */
  app.post("/api/v1/benefits/:id/claim",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const claims = await requireSession(req);
      if (!claims) return problem(reply, 401, "unauthorized", "нужен access-токен");
      const scope = await workerScope(claims);
      if (!scope) {
        return problem(reply, 403, "worker_inactive", "сотрудник не числится действующим");
      }

      try {
        return await claimBenefit(Number((req.params as { id: string }).id), scope);
      } catch (error) {
        if (error instanceof PoolExhausted) {
          // Отдельный ответ, а не 500: пул кончился — это штатная ситуация,
          // о которой надо сказать сотруднику и уведомить администратора.
          req.log.warn({ benefitId: (req.params as { id: string }).id }, "пул промокодов исчерпан");
          return problem(reply, 409, "pool_exhausted", "промокоды закончились");
        }
        if (error instanceof BenefitNotAvailable) {
          return problem(reply, 409, error.code, error.message);
        }
        throw error;
      }
    },
  );

  // ── Админ-API ──────────────────────────────────────────────────────────
  //
  // Авторизация — service secret от web: дашборд уже проверил сессию
  // администратора, второй раз спрашивать пароль незачем. Наружу порт
  // 3106 не открыт, ходить сюда можно только с самого сервера.

  function adminEmail(req: { headers: Record<string, unknown> }): string | null {
    const secret = String(req.headers["x-monitor-import-secret"] ?? "").trim();
    if (!config.serviceSecret || secret !== config.serviceSecret) return null;
    return String(req.headers["x-monitor-user-email"] ?? "admin").trim() || "admin";
  }

  app.get("/admin/refs", async (req, reply) => {
    if (!adminEmail(req)) return problem(reply, 401, "unauthorized", "нужен service secret");
    return listRefs();
  });

  app.post("/admin/refs/sync", async (req, reply) => {
    const who = adminEmail(req);
    if (!who) return problem(reply, 401, "unauthorized", "нужен service secret");
    return syncRefs(who);
  });

  app.get("/admin/link-requests", async (req, reply) => {
    if (!adminEmail(req)) return problem(reply, 401, "unauthorized", "нужен service secret");
    const q = req.query as Record<string, string | undefined>;
    return { items: await listLinkRequests(q.status ?? null) };
  });

  app.post("/admin/link-requests/:id/approve", async (req, reply) => {
    const who = adminEmail(req);
    if (!who) return problem(reply, 401, "unauthorized", "нужен service secret");
    const body = (req.body ?? {}) as { workerId?: number };
    if (!body.workerId) return problem(reply, 400, "no_worker", "не указан сотрудник");
    const result = await approveLinkRequest(
      Number((req.params as { id: string }).id),
      Number(body.workerId),
      who,
    );
    if (!result.ok) return problem(reply, 409, "approve_failed", result.reason ?? "не удалось");
    return { status: "ok" };
  });

  app.post("/admin/link-requests/:id/reject", async (req, reply) => {
    const who = adminEmail(req);
    if (!who) return problem(reply, 401, "unauthorized", "нужен service secret");
    const body = (req.body ?? {}) as { comment?: string };
    const result = await rejectLinkRequest(
      Number((req.params as { id: string }).id),
      who,
      body.comment ?? null,
    );
    if (!result.ok) return problem(reply, 409, "reject_failed", result.reason ?? "не удалось");
    return { status: "ok" };
  });

  app.get("/admin/audiences", async (req, reply) => {
    if (!adminEmail(req)) return problem(reply, 401, "unauthorized", "нужен service secret");
    return { items: await listAudiences() };
  });

  app.post("/admin/audiences", async (req, reply) => {
    const who = adminEmail(req);
    if (!who) return problem(reply, 401, "unauthorized", "нужен service secret");
    const body = (req.body ?? {}) as {
      name?: string;
      isEveryone?: boolean;
      rules?: Array<{ postIds?: number[]; departmentIds?: number[] }>;
    };
    if (!body.name?.trim()) return problem(reply, 400, "no_name", "не указано название");
    return createAudience(
      {
        name: body.name.trim(),
        isEveryone: body.isEveryone === true,
        rules: (body.rules ?? []).map((r) => ({
          postIds: r.postIds ?? [],
          departmentIds: r.departmentIds ?? [],
        })),
      },
      who,
    );
  });

  app.get("/admin/news", async (req, reply) => {
    if (!adminEmail(req)) return problem(reply, 401, "unauthorized", "нужен service secret");
    return { items: await listNewsAdmin() };
  });

  app.post("/admin/news", async (req, reply) => {
    const who = adminEmail(req);
    if (!who) return problem(reply, 401, "unauthorized", "нужен service secret");
    const body = (req.body ?? {}) as {
      id?: number;
      title?: string;
      lead?: string;
      bodyMd?: string;
      audienceId?: number | null;
    };
    if (!body.title?.trim()) return problem(reply, 400, "no_title", "не указан заголовок");
    return upsertNews(
      {
        id: body.id,
        title: body.title.trim(),
        lead: body.lead?.trim() || null,
        bodyMd: body.bodyMd ?? "",
        audienceId: body.audienceId ?? null,
      },
      who,
    );
  });

  app.post("/admin/news/:id/publish", async (req, reply) => {
    const who = adminEmail(req);
    if (!who) return problem(reply, 401, "unauthorized", "нужен service secret");
    const result = await publishNews(Number((req.params as { id: string }).id), who);
    if (!result.ok) return problem(reply, 409, "publish_failed", result.reason ?? "не удалось");
    return { status: "ok" };
  });

  app.post("/admin/news/:id/unpublish", async (req, reply) => {
    const who = adminEmail(req);
    if (!who) return problem(reply, 401, "unauthorized", "нужен service secret");
    await unpublishNews(Number((req.params as { id: string }).id), who);
    return { status: "ok" };
  });

  app.get("/admin/audit", async (req, reply) => {
    if (!adminEmail(req)) return problem(reply, 401, "unauthorized", "нужен service secret");
    return { items: await listAudit(100) };
  });

  return app;
}

const app = await buildApp();

// Контрактная проверка до открытия порта: с неполной схемой стартовать
// нельзя, иначе сотрудники тихо лишатся доступа.
await verifyCRMOnStartup();

await app.listen({ port: getConfig().port, host: "0.0.0.0" });
