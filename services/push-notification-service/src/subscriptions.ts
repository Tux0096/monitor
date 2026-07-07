import { eq, sql } from "drizzle-orm";
import { db } from "./db/client.js";
import { pushAlertDedup, pushSubscriptions } from "./db/schema.js";

export async function upsertPushSubscription(input: {
  userEmail: string;
  fcmToken: string;
  userAgent?: string | null;
  platform?: string | null;
}) {
  await db
    .insert(pushSubscriptions)
    .values({
      userEmail: input.userEmail,
      fcmToken: input.fcmToken,
      userAgent: input.userAgent ?? null,
      platform: input.platform ?? null,
      lastSeenAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.fcmToken,
      set: {
        userEmail: input.userEmail,
        userAgent: input.userAgent ?? null,
        platform: input.platform ?? null,
        lastSeenAt: sql`now()`,
        updatedAt: sql`now()`,
      },
    });
}

export async function removePushSubscription(fcmToken: string) {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.fcmToken, fcmToken));
}

export async function listPushTokens(): Promise<string[]> {
  const rows = await db
    .select({ fcmToken: pushSubscriptions.fcmToken })
    .from(pushSubscriptions)
    .orderBy(sql`${pushSubscriptions.updatedAt} desc`);
  return rows.map((row) => row.fcmToken);
}

export async function shouldSendPushAlert(
  alertKey: string,
  cooldownMinutes = 60,
): Promise<boolean> {
  const cutoff = sql`now() - (${cooldownMinutes} * interval '1 minute')`;
  const rows = await db
    .select({ alertKey: pushAlertDedup.alertKey })
    .from(pushAlertDedup)
    .where(
      sql`${pushAlertDedup.alertKey} = ${alertKey} AND ${pushAlertDedup.sentAt} > ${cutoff}`,
    )
    .limit(1);
  return rows.length === 0;
}

export async function markPushAlertSent(alertKey: string) {
  await db
    .insert(pushAlertDedup)
    .values({ alertKey, sentAt: sql`now()` })
    .onConflictDoUpdate({
      target: pushAlertDedup.alertKey,
      set: { sentAt: sql`now()` },
    });
}

export async function countPushSubscriptions(): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pushSubscriptions);
  return rows[0]?.count ?? 0;
}
