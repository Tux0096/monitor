import { sendFcmNotification } from "../fcm.js";
import type { PerformanceHistoryReport } from "../performance-types.js";
import {
  listPushTokens,
  markPushAlertSent,
  shouldSendPushAlert,
} from "../subscriptions.js";
import {
  DASHBOARD_TAB_URLS,
  getMetricSlowLabel,
  isMetricSlow,
  PERFORMANCE_TAB_LABELS,
  resolveAlertUrl,
} from "../thresholds.js";

function formatMs(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return "—";
  if (ms >= 1000) return `${Number((ms / 1000).toFixed(2))} с`;
  return `${Math.round(ms)} мс`;
}

export async function evaluatePerformanceReport(
  report: PerformanceHistoryReport,
): Promise<{
  checked: number;
  notified: number;
  tokens: number;
  errors: string[];
}> {
  const slowItems = report.pages.filter((page) =>
    isMetricSlow(page.currentMs, page.sourceType),
  );
  const tokens = await listPushTokens();

  if (slowItems.length === 0 || tokens.length === 0) {
    return {
      checked: slowItems.length,
      notified: 0,
      tokens: tokens.length,
      errors: [],
    };
  }

  let notified = 0;
  const errors: string[] = [];

  for (const item of slowItems) {
    const alertKey = `slow:${item.sourceType}:${item.metricName}:${item.page}`;
    const allowed = await shouldSendPushAlert(alertKey, 60);
    if (!allowed) continue;

    const tabLabel = PERFORMANCE_TAB_LABELS[item.sourceType];
    const body = `${item.metricName}: ${formatMs(item.currentMs)} · норма ${getMetricSlowLabel(item.sourceType)}\n${item.page}`;
    const result = await sendFcmNotification(tokens, {
      title: `${tabLabel}: показатель выше нормы`,
      body,
      url: resolveAlertUrl(DASHBOARD_TAB_URLS.dashboard),
      tag: alertKey,
    });

    if (result.sent > 0) {
      await markPushAlertSent(alertKey);
      notified += 1;
    }
    errors.push(...result.errors);
  }

  return { checked: slowItems.length, notified, tokens: tokens.length, errors };
}
