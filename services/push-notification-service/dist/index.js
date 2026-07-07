import cors from "@fastify/cors";
import Fastify from "fastify";
import { z } from "zod";
import { notifySchema, sendDomainNotification } from "./alerts/notify.js";
import { checkSlowMetricsAndPush } from "./alerts/slow-metrics.js";
import { verifyServiceSecret, getUserEmailFromHeader } from "./auth.js";
import { getPushFirebaseWebConfig } from "./config.js";
import { buildMessagingServiceWorker } from "./messaging-sw.js";
import { countPushSubscriptions, removePushSubscription, upsertPushSubscription, } from "./subscriptions.js";
const subscribeSchema = z.object({
    token: z.string().min(1),
    platform: z.string().optional(),
});
export async function buildApp() {
    const app = Fastify({ logger: true });
    await app.register(cors, { origin: true, credentials: true });
    app.get("/health", async () => ({
        status: "ok",
        service: "push-notification-service",
        version: "0.1.0",
        subscriptions: await countPushSubscriptions(),
        pushEnabled: Boolean(getPushFirebaseWebConfig()),
    }));
    app.get("/push/v1/config", async () => {
        const config = getPushFirebaseWebConfig();
        if (!config)
            return { enabled: false };
        return { ...config, enabled: true };
    });
    app.get("/push/v1/messaging-sw.js", async (_req, reply) => {
        const config = getPushFirebaseWebConfig();
        if (!config) {
            return reply
                .status(404)
                .header("Content-Type", "application/javascript; charset=utf-8")
                .send("// Firebase push is not configured\n");
        }
        return reply
            .header("Content-Type", "application/javascript; charset=utf-8")
            .header("Cache-Control", "no-cache")
            .header("Service-Worker-Allowed", "/")
            .send(buildMessagingServiceWorker(config));
    });
    app.post("/push/v1/subscribe", async (req, reply) => {
        if (!verifyServiceSecret(req.headers["x-monitor-import-secret"])) {
            return reply.status(401).send({ error: "Unauthorized" });
        }
        const userEmail = getUserEmailFromHeader(req.headers["x-monitor-user-email"]);
        if (!userEmail) {
            return reply.status(400).send({ error: "User email required" });
        }
        const parsed = subscribeSchema.safeParse(req.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: "Invalid request" });
        }
        await upsertPushSubscription({
            userEmail,
            fcmToken: parsed.data.token.trim(),
            userAgent: req.headers["user-agent"] ?? null,
            platform: parsed.data.platform ?? null,
        });
        return { ok: true };
    });
    app.post("/push/v1/unsubscribe", async (req, reply) => {
        if (!verifyServiceSecret(req.headers["x-monitor-import-secret"])) {
            return reply.status(401).send({ error: "Unauthorized" });
        }
        const parsed = subscribeSchema.safeParse(req.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: "Invalid request" });
        }
        await removePushSubscription(parsed.data.token.trim());
        return { ok: true };
    });
    app.post("/push/v1/alerts/check-slow-metrics", async (req, reply) => {
        if (!verifyServiceSecret(req.headers["x-monitor-import-secret"])) {
            return reply.status(401).send({ error: "Unauthorized" });
        }
        try {
            const result = await checkSlowMetricsAndPush();
            return { ...result, checkedAt: new Date().toISOString() };
        }
        catch (error) {
            return reply.status(500).send({
                error: error instanceof Error ? error.message : "push check failed",
            });
        }
    });
    app.post("/push/v1/notify", async (req, reply) => {
        if (!verifyServiceSecret(req.headers["x-monitor-import-secret"])) {
            return reply.status(401).send({ error: "Unauthorized" });
        }
        const parsed = notifySchema.safeParse(req.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: "Invalid request" });
        }
        try {
            const result = await sendDomainNotification(parsed.data);
            return { ...result, sentAt: new Date().toISOString() };
        }
        catch (error) {
            return reply.status(500).send({
                error: error instanceof Error ? error.message : "notify failed",
            });
        }
    });
    return app;
}
async function main() {
    const app = await buildApp();
    const port = Number(process.env.PORT ?? 3103);
    await app.listen({ port, host: "0.0.0.0" });
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
