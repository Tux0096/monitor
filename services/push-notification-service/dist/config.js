export function getPushFirebaseWebConfig() {
    const apiKey = process.env.NEXT_PUBLIC_PUSH_FIREBASE_API_KEY?.trim();
    const authDomain = process.env.NEXT_PUBLIC_PUSH_FIREBASE_AUTH_DOMAIN?.trim();
    const projectId = process.env.PUSH_FIREBASE_PROJECT_ID?.trim();
    const messagingSenderId = process.env.NEXT_PUBLIC_PUSH_FIREBASE_MESSAGING_SENDER_ID?.trim();
    const appId = process.env.NEXT_PUBLIC_PUSH_FIREBASE_APP_ID?.trim();
    const vapidKey = process.env.NEXT_PUBLIC_PUSH_FIREBASE_VAPID_KEY?.trim();
    if (!apiKey || !projectId || !messagingSenderId || !appId || !vapidKey) {
        return null;
    }
    return {
        apiKey,
        authDomain: authDomain || `${projectId}.firebaseapp.com`,
        projectId,
        messagingSenderId,
        appId,
        vapidKey,
    };
}
export function getPublicAppUrl() {
    return process.env.PUBLIC_APP_URL?.trim() || "https://it.franchise-fuji.ru";
}
export function getMonitorWebUrl() {
    return process.env.MONITOR_WEB_URL?.trim() || "http://127.0.0.1:3080";
}
