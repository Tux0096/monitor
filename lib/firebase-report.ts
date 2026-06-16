import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import type { ResolvedGoogleAuth } from "@/lib/google-auth";

export type FirebaseAppRow = {
  platform: string;
  displayName: string;
  appId: string;
  extra: string;
};

export type FirebaseReport = {
  projectId: string;
  authSource: ResolvedGoogleAuth["source"] | "none";
  project: Record<string, unknown> | null;
  apps: FirebaseAppRow[];
  apiErrors: string[];
  fetchedAt: string;
};

type GoogleAuthClient = ResolvedGoogleAuth["auth"];

export async function buildFirebaseReport(
  auth: GoogleAuthClient,
  projectId: string,
  authSource: ResolvedGoogleAuth["source"],
): Promise<FirebaseReport> {
  const apiErrors: string[] = [];
  const fb = google.firebase({ version: "v1beta1", auth: auth as OAuth2Client });
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
    authSource,
    project,
    apps,
    apiErrors,
    fetchedAt: new Date().toISOString(),
  };
}
