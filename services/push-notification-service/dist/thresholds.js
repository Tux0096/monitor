export const METRIC_SLOW_MS_BY_SOURCE = {
    site: 1300,
    mobile: 1100,
    mobile_api: 1100,
};
export const PERFORMANCE_TAB_LABELS = {
    site: "Сайт",
    mobile: "Приложение",
    mobile_api: "API приложения",
};
export const DASHBOARD_TAB_URLS = {
    dashboard: "/dashboard",
    appeals: "/dashboard/appeals",
    appeals_report: "/dashboard/appeals-report",
    courier_report: "/dashboard/courier-report",
};
export function getMetricSlowMs(sourceType) {
    return METRIC_SLOW_MS_BY_SOURCE[sourceType];
}
export function getMetricSlowLabel(sourceType) {
    const ms = getMetricSlowMs(sourceType);
    if (ms >= 1000) {
        return `${Number((ms / 1000).toFixed(1))} с`;
    }
    return `${ms} мс`;
}
export function isMetricSlow(ms, sourceType) {
    return (ms ?? 0) > getMetricSlowMs(sourceType);
}
export function resolveAlertUrl(path) {
    const base = process.env.PUBLIC_APP_URL?.trim() || "https://it.franchise-fuji.ru";
    if (path.startsWith("http://") || path.startsWith("https://"))
        return path;
    return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}
