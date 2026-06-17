import jwt from "jsonwebtoken";
import type { User } from "./db/schema.js";
import { toPublicUser } from "./users.js";

const secret = () => {
  const s = process.env.JWT_SECRET?.trim();
  if (!s || s.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters");
  }
  return s;
};

export function signAccessToken(user: User): { token: string; expiresIn: number } {
  const expiresInSec = parseExpires(process.env.JWT_EXPIRES_IN ?? "7d");
  const token = jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    secret(),
    { expiresIn: expiresInSec },
  );
  return { token, expiresIn: expiresInSec };
}

export function verifyAccessToken(
  token: string,
): { sub: string; email: string; role?: string } | null {
  try {
    const payload = jwt.verify(token, secret()) as jwt.JwtPayload;
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      return null;
    }
    return {
      sub: payload.sub,
      email: payload.email,
      role: typeof payload.role === "string" ? payload.role : undefined,
    };
  } catch {
    return null;
  }
}

export function userFromToken(user: User) {
  return toPublicUser(user);
}

function parseExpires(raw: string): number {
  const m = raw.match(/^(\d+)([smhd])$/);
  if (!m) return 7 * 24 * 3600;
  const n = Number(m[1]);
  switch (m[2]) {
    case "s":
      return n;
    case "m":
      return n * 60;
    case "h":
      return n * 3600;
    case "d":
      return n * 86400;
    default:
      return 7 * 24 * 3600;
  }
}
