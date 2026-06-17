import cors from "@fastify/cors";
import { eq } from "drizzle-orm";
import Fastify from "fastify";
import { z } from "zod";
import { db } from "./db/client.js";
import { users } from "./db/schema.js";
import { signAccessToken, verifyAccessToken } from "./jwt.js";
import {
  ensureBootstrapUser,
  findUserByEmail,
  toPublicUser,
  verifyPassword,
} from "./users.js";

const loginSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(1),
});

export async function buildApp() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true, credentials: true });

  app.get("/health", async () => ({
    status: "ok",
    service: "auth-service",
    version: "0.1.0",
  }));

  app.post("/auth/v1/login", async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request" });
    }

    const email =
      parsed.data.email?.trim() ||
      process.env.BOOTSTRAP_EMAIL?.trim() ||
      "admin@it.franchise-fuji.ru";

    const user = await findUserByEmail(email);
    if (!user || !(await verifyPassword(user, parsed.data.password))) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    const { token, expiresIn } = signAccessToken(user);
    return {
      accessToken: token,
      expiresIn,
      user: toPublicUser(user),
    };
  });

  app.get("/auth/v1/validate", async (req, reply) => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      return reply.status(401).send({ valid: false });
    }

    const claims = verifyAccessToken(token);
    if (!claims) {
      return reply.status(401).send({ valid: false });
    }

    const rows = await db
      .select()
      .from(users)
      .where(eq(users.id, claims.sub))
      .limit(1);
    const user = rows[0];
    if (!user) {
      return reply.status(401).send({ valid: false });
    }

    return { valid: true, user: toPublicUser(user) };
  });

  app.get("/auth/v1/me", async (req, reply) => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const claims = verifyAccessToken(token);
    if (!claims) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const rows = await db
      .select()
      .from(users)
      .where(eq(users.id, claims.sub))
      .limit(1);
    const user = rows[0];
    if (!user) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    return { user: toPublicUser(user) };
  });

  return app;
}

async function main() {
  await ensureBootstrapUser();
  const app = await buildApp();
  const port = Number(process.env.PORT ?? 3101);
  await app.listen({ port, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
