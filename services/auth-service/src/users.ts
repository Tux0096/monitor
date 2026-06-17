import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "./db/client.js";
import { users, type User } from "./db/schema.js";

export async function findUserByEmail(email: string): Promise<User | undefined> {
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0];
}

export async function verifyPassword(
  user: User,
  password: string,
): Promise<boolean> {
  return bcrypt.compare(password, user.passwordHash);
}

export async function ensureBootstrapUser(): Promise<void> {
  const email = process.env.BOOTSTRAP_EMAIL?.trim();
  const password = process.env.BOOTSTRAP_PASSWORD?.trim();
  if (!email || !password) return;

  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await findUserByEmail(email);
  if (existing) {
    await db
      .update(users)
      .set({ name: existing.name ?? "Admin", passwordHash, role: "admin" })
      .where(eq(users.id, existing.id));
    return;
  }

  await db.insert(users).values({
    email,
    passwordHash,
    name: "Admin",
    role: "admin",
  });
  console.log(`Bootstrap user created: ${email}`);
}

export function toPublicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}
