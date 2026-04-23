import { google } from "googleapis";

export type FirebaseAppRow = {
  platform: string;
  displayName: string;
  appId: string;
  extra: string;
};

export type FirebaseReport = {
  projectId: string;
  project: Record<string, unknown> | null;
  apps: FirebaseAppRow[];
  apiErrors: string[];
  fetchedAt: string;
};

export async function buildFirebaseReport(
  accessToken: string,
  projectId: string,
): Promise<FirebaseReport> {
  const apiErrors: string[] = [];
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  const fb = google.firebase({ version: "v1beta1", auth: oauth2 });
  const parent = `projects/${projectId}`;

  let project: Record<string, unknown> | null = null;
  try {
    const r = await fb.projects.get({ name: parent });
    project = (r.data ?? null) as Record<string, unknown> | null;
  } catch (e: unknown) {
    apiErrors.push(
      `Проект: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const apps: FirebaseAppRow[] = [];

  try {
    const r = await fb.projects.androidApps.list({ parent });
    for (const a of r.data.apps ?? []) {
      apps.push({
        platform: "Android",
        displayName: a.displayName ?? "",
        appId: a.appId ?? "",
        extra: a.packageName ?? "",
      });
    }
  } catch (e: unknown) {
    apiErrors.push(
      `Приложения Android: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  try {
    const r = await fb.projects.iosApps.list({ parent });
    for (const a of r.data.apps ?? []) {
      apps.push({
        platform: "iOS",
        displayName: a.displayName ?? "",
        appId: a.appId ?? "",
        extra: a.bundleId ?? "",
      });
    }
  } catch (e: unknown) {
    apiErrors.push(
      `Приложения iOS: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  try {
    const r = await fb.projects.webApps.list({ parent });
    for (const a of r.data.apps ?? []) {
      apps.push({
        platform: "Web",
        displayName: a.displayName ?? "",
        appId: a.appId ?? "",
        extra: a.projectId ?? "",
      });
    }
  } catch (e: unknown) {
    apiErrors.push(
      `Веб-приложения: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return {
    projectId,
    project,
    apps,
    apiErrors,
    fetchedAt: new Date().toISOString(),
  };
}
