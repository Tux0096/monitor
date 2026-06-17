import { getRuntimeEnv } from "@/lib/runtime-env";

const maxApiBase = "https://platform-api.max.ru";

export async function sendMaxMessage(chatId: string, text: string) {
  const token = getRuntimeEnv("MAX_BOT_TOKEN");
  if (!token) {
    throw new Error("MAX_BOT_TOKEN is not configured");
  }

  const url = new URL(`${maxApiBase}/messages`);
  url.searchParams.set("chat_id", chatId);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      notify: true,
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`MAX send message failed: ${response.status}: ${details}`);
  }
}

export async function subscribeMaxWebhook(url: string, secret: string) {
  const token = getRuntimeEnv("MAX_BOT_TOKEN");
  if (!token) {
    throw new Error("MAX_BOT_TOKEN is not configured");
  }
  const response = await fetch(`${maxApiBase}/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      secret,
      update_types: ["message_created"],
    }),
  });

  if (!response.ok) {
    throw new Error(`MAX subscribe failed: ${response.status}: ${await response.text()}`);
  }

  return response.json();
}
