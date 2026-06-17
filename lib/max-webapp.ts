import { createHmac, timingSafeEqual } from "node:crypto";

import { getRuntimeEnv } from "@/lib/runtime-env";

export type MaxWebAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string | null;
  language_code?: string;
  photo_url?: string | null;
};

export type MaxWebAppChat = {
  id: number;
  type: "DIALOG" | "CHAT" | "CHANNEL" | string;
};

export type ParsedMaxInitData = {
  user: MaxWebAppUser;
  chat: MaxWebAppChat | null;
  queryId: string | null;
  authDate: number;
  raw: string;
};

function botToken() {
  return getRuntimeEnv("MAX_BOT_TOKEN")?.replace(/^Bearer\s+/i, "") ?? null;
}

function safeEqualHex(left: string, right: string) {
  const normalizedRight = right.trim().toLowerCase();
  if (!/^[a-f0-9]+$/i.test(normalizedRight) || left.length !== normalizedRight.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(normalizedRight, "hex"));
}

export function validateMaxInitData(initData: string): ParsedMaxInitData | null {
  const token = botToken();
  const raw = initData.trim();
  if (!token || !raw) return null;

  const params = raw.split("&").map((part) => {
    const idx = part.indexOf("=");
    if (idx < 0) return [part, ""] as [string, string];
    return [part.slice(0, idx), decodeURIComponent(part.slice(idx + 1))] as [string, string];
  });

  const hashEntries = params.filter(([key]) => key === "hash");
  if (hashEntries.length !== 1) return null;
  const originalHash = hashEntries[0][1].toLowerCase();

  const sorted = params
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b));

  const launchParams = sorted.map(([key, value]) => `${key}=${value}`).join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
  const signature = createHmac("sha256", secretKey).update(launchParams).digest("hex");
  if (!safeEqualHex(signature, originalHash)) return null;

  const authDate = Number(sorted.find(([key]) => key === "auth_date")?.[1] ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > 86_400) return null;

  const userRaw = sorted.find(([key]) => key === "user")?.[1];
  if (!userRaw) return null;

  let user: MaxWebAppUser;
  try {
    user = JSON.parse(userRaw) as MaxWebAppUser;
  } catch {
    return null;
  }
  if (!user?.id) return null;

  const chatRaw = sorted.find(([key]) => key === "chat")?.[1];
  let chat: MaxWebAppChat | null = null;
  if (chatRaw) {
    try {
      chat = JSON.parse(chatRaw) as MaxWebAppChat;
    } catch {
      chat = null;
    }
  }

  return {
    user,
    chat,
    queryId: sorted.find(([key]) => key === "query_id")?.[1] ?? null,
    authDate,
    raw,
  };
}

export function validateMaxContactPhone(input: {
  phone: string;
  authDate: string;
  hash: string;
  userId: string | number;
}) {
  const token = botToken();
  if (!token) return false;

  const phone = input.phone.replace(/^\+/, "");
  const pairs = [
    ["auth_date", input.authDate],
    ["phone", phone],
    ["user_id", String(input.userId)],
  ] as [string, string][];
  pairs.sort(([a], [b]) => a.localeCompare(b));

  const dataString = pairs.map(([key, value]) => `${key}=${value}`).join("\n");
  const signature = createHmac("sha256", token).update(dataString).digest("hex");
  return safeEqualHex(signature, input.hash);
}

export function formatMaxUserName(user: MaxWebAppUser) {
  return [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || null;
}
