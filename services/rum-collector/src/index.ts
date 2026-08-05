import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";

import { getAllowedOrigins, getPort, getServiceSecret } from "./config.js";
import { ingestPayload } from "./ingest.js";
import { readIngestHealth, readRumReport } from "./report.js";
import { runMaintenance } from "./rollup.js";

function verifyServiceSecret(header: string | string[] | undefined): boolean {
  const secret = getServiceSecret();
  if (!secret) return false;
  const value = Array.isArray(header) ? header[0] : header;
  return value?.trim() === secret;
}

export async function buildApp() {
  // bodyLimit намеренно маленький: эндпоинт публичный, большие тела нам не нужны.
  const app = Fastify({ logger: true, bodyLimit: 16 * 1024 });

  const allowedOrigins = getAllowedOrigins();
  await app.register(cors, {
    origin(origin, callback) {
      // Запросы без Origin (sendBeacon в части сборок WebView, curl) пропускаем:
      // отсечь их значило бы потерять часть мобильных данных.
      if (!origin) return callback(null, true);
      callback(null, allowedOrigins.includes(origin));
    },
    methods: ["POST", "GET", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-monitor-import-secret"],
  });

  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
    // Лимит на приём событий; отчёты защищены секретом и в лимит не упираются.
    allowList: (req) => req.url.startsWith("/rum/v1/report"),
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "rum-collector",
    version: "0.1.0",
    allowedOrigins,
  }));

  /**
   * Приём метрик. Публичный, без авторизации — иначе браузер пользователя
   * не сможет ничего прислать. Защита: CORS, rate limit, строгая схема,
   * границы значений, маленький bodyLimit.
   *
   * Всегда отвечает 204, даже на мусор: клиент использует sendBeacon и ответ
   * не читает, а возвращать ошибку наружу — подсказывать, как подбирать payload.
   */
  app.post("/rum/v1/vitals", async (req, reply) => {
    try {
      const result = await ingestPayload(req.body);
      if (result.rejected > 0) {
        req.log.warn({ rejected: result.rejected, reasons: result.reasons }, "rum: часть событий отброшена");
      }
    } catch (error) {
      req.log.error({ err: error }, "rum: сбой приёма");
    }
    return reply.status(204).send();
  });

  app.get("/rum/v1/report", async (req, reply) => {
    if (!verifyServiceSecret(req.headers["x-monitor-import-secret"])) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const query = req.query as Record<string, string | undefined>;
    return readRumReport({
      from: query.from,
      to: query.to,
      source: query.source ?? null,
      platform: query.platform ?? null,
    });
  });

  app.get("/rum/v1/health/ingest", async (req, reply) => {
    if (!verifyServiceSecret(req.headers["x-monitor-import-secret"])) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    return readIngestHealth();
  });

  app.post("/rum/v1/maintenance", async (req, reply) => {
    if (!verifyServiceSecret(req.headers["x-monitor-import-secret"])) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    return runMaintenance();
  });

  return app;
}

const app = await buildApp();
const port = getPort();

// Свёртка раз в 10 минут внутри процесса: отдельная cron-задача на сервере
// для этого избыточна, а данные на дашборде должны быть свежими.
setInterval(() => {
  runMaintenance().catch((error) => app.log.error({ err: error }, "rum: сбой свёртки"));
}, 10 * 60 * 1000);

await app.listen({ port, host: "0.0.0.0" });
