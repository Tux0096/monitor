import crypto from "node:crypto";

import { SignJWT, jwtVerify } from "jose";

import { getConfig } from "../config.js";
import { sql } from "../db/client.js";

export type Tokens = {
  access: string;
  refresh: string;
  accessExpiresAt: string;
};

export type SessionClaims = {
  appUserId: number;
  workerId: number;
  telegramId: number;
};

function secretKey(): Uint8Array {
  return new TextEncoder().encode(getConfig().jwtSecret);
}

/**
 * Refresh хранится хешем: утечка таблицы сессий не должна давать
 * возможность войти. Токен видит только клиент.
 */
function hashRefresh(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function newRefreshToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

async function signAccess(claims: SessionClaims): Promise<{ token: string; expiresAt: Date }> {
  const config = getConfig();
  const expiresAt = new Date(Date.now() + config.accessTtlMin * 60_000);
  const token = await new SignJWT({
    worker_id: claims.workerId,
    telegram_id: claims.telegramId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(claims.appUserId))
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secretKey());
  return { token, expiresAt };
}

export async function verifyAccess(token: string): Promise<SessionClaims> {
  const { payload } = await jwtVerify(token, secretKey());
  const appUserId = Number(payload.sub);
  const workerId = Number(payload.worker_id);
  const telegramId = Number(payload.telegram_id);
  if (!Number.isFinite(appUserId) || !Number.isFinite(workerId)) {
    throw new Error("bad access token payload");
  }
  return { appUserId, workerId, telegramId };
}

/** Выдаёт пару токенов и заводит запись сессии. */
export async function issueTokens(
  claims: SessionClaims,
  device: string | null,
  rotatedFrom: number | null = null,
): Promise<Tokens> {
  const config = getConfig();
  const refresh = newRefreshToken();
  const expiresAt = new Date(Date.now() + config.refreshTtlDays * 86_400_000);

  await sql`
    INSERT INTO cab_app_session (app_user_id, refresh_hash, device, expires_at, rotated_from)
    VALUES (${claims.appUserId}, ${hashRefresh(refresh)}, ${device},
            ${expiresAt.toISOString()}::timestamptz, ${rotatedFrom})
  `;

  const access = await signAccess(claims);
  return {
    access: access.token,
    refresh,
    accessExpiresAt: access.expiresAt.toISOString(),
  };
}

export class RefreshReuseDetected extends Error {
  constructor() {
    super("refresh token reuse detected, session chain revoked");
    this.name = "RefreshReuseDetected";
  }
}

/**
 * Ротация refresh-токена.
 *
 * Каждое использование выдаёт новый токен и гасит предыдущий. Повторное
 * предъявление уже использованного — признак кражи: гасим всю цепочку
 * сессий пользователя, а не только предъявленную.
 */
export async function rotateRefresh(refresh: string, device: string | null): Promise<Tokens> {
  const hash = hashRefresh(refresh);

  const rows = (await sql`
    SELECT s.id, s.app_user_id, s.revoked_at, s.expires_at,
           u.worker_id, u.telegram_id, u.disabled_at
    FROM cab_app_session s
    JOIN cab_app_user u ON u.id = s.app_user_id
    WHERE s.refresh_hash = ${hash}
    LIMIT 1
  `) as Array<{
    id: number;
    app_user_id: number;
    revoked_at: string | null;
    expires_at: string;
    worker_id: number;
    telegram_id: string | number;
    disabled_at: string | null;
  }>;

  const session = rows[0];
  if (!session) throw new Error("unknown refresh token");

  if (session.revoked_at) {
    // Токен уже использовали. Либо это кража, либо клиент отправил
    // повтор — в обоих случаях безопаснее разлогинить везде.
    await revokeAllForUser(session.app_user_id);
    throw new RefreshReuseDetected();
  }

  if (new Date(session.expires_at).getTime() < Date.now()) {
    throw new Error("refresh token expired");
  }
  if (session.disabled_at) throw new Error("user disabled");

  await sql`
    UPDATE cab_app_session SET revoked_at = now() WHERE id = ${session.id}
  `;

  return issueTokens(
    {
      appUserId: session.app_user_id,
      workerId: session.worker_id,
      telegramId: Number(session.telegram_id),
    },
    device,
    session.id,
  );
}

export async function revokeRefresh(refresh: string): Promise<void> {
  await sql`
    UPDATE cab_app_session SET revoked_at = now()
    WHERE refresh_hash = ${hashRefresh(refresh)} AND revoked_at IS NULL
  `;
}

export async function revokeAllForUser(appUserId: number): Promise<void> {
  await sql`
    UPDATE cab_app_session SET revoked_at = now()
    WHERE app_user_id = ${appUserId} AND revoked_at IS NULL
  `;
}
