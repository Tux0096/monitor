import { z } from "zod";
import { sendFcmNotification } from "../fcm.js";
import { listPushTokens, markPushAlertSent, shouldSendPushAlert, } from "../subscriptions.js";
import { DASHBOARD_TAB_URLS, resolveAlertUrl } from "../thresholds.js";
const notifySchema = z.object({
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(1000),
    url: z.string().optional(),
    tag: z.string().optional(),
    domain: z
        .enum(["dashboard", "appeals", "appeals_report", "courier_report"])
        .optional(),
    cooldownMinutes: z.number().int().min(0).max(24 * 60).optional(),
    dedupeKey: z.string().optional(),
});
export async function sendDomainNotification(input) {
    const parsed = notifySchema.parse(input);
    const tokens = await listPushTokens();
    if (tokens.length === 0) {
        return { sent: 0, failed: 0, tokens: 0, skipped: true, errors: [] };
    }
    const alertKey = parsed.dedupeKey ??
        parsed.tag ??
        `notify:${parsed.domain ?? "custom"}:${parsed.title.slice(0, 40)}`;
    if (parsed.cooldownMinutes !== 0) {
        const allowed = await shouldSendPushAlert(alertKey, parsed.cooldownMinutes ?? 60);
        if (!allowed) {
            return { sent: 0, failed: 0, tokens: tokens.length, skipped: true, errors: [] };
        }
    }
    const defaultPath = parsed.domain
        ? DASHBOARD_TAB_URLS[parsed.domain]
        : DASHBOARD_TAB_URLS.dashboard;
    const result = await sendFcmNotification(tokens, {
        title: parsed.title,
        body: parsed.body,
        url: resolveAlertUrl(parsed.url ?? defaultPath),
        tag: parsed.tag ?? alertKey,
    });
    if (result.sent > 0 && parsed.cooldownMinutes !== 0) {
        await markPushAlertSent(alertKey);
    }
    return { ...result, tokens: tokens.length, skipped: false };
}
export { notifySchema };
