import { notifyPushService } from "@/lib/push-service-client";

export async function notifyNewAppealPush(input: {
  appealNumber: number;
  preview: string;
  domain?: "appeals" | "appeals_report" | "courier_report";
}) {
  const preview = input.preview.trim();
  const body =
    preview.length > 140 ? `${preview.slice(0, 137)}…` : preview || "Без описания";

  await notifyPushService({
    title: `Новое обращение №${input.appealNumber}`,
    body,
    domain: input.domain ?? "appeals",
    dedupeKey: `appeal:new:${input.appealNumber}`,
    cooldownMinutes: 0,
  });
}
