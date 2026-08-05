import { getRuntimeEnv } from "@/lib/runtime-env";

// "Ошибка" issue type id in the CRM project (jira.infra-digital.ru) — confirmed via
// GET /rest/api/2/project/CRM. createmeta is disabled on this instance.
const BUG_ISSUE_TYPE_ID = "10004";

type JiraConfig = {
  baseUrl: string;
  token: string;
  projectKey: string;
};

function jiraConfig(): JiraConfig | null {
  const baseUrl = getRuntimeEnv("JIRA_BASE_URL")?.replace(/\/$/, "");
  const token = getRuntimeEnv("JIRA_TOKEN");
  const projectKey = getRuntimeEnv("JIRA_PROJECT_KEY") || "CRM";
  if (!baseUrl || !token) return null;
  return { baseUrl, token, projectKey };
}

function priorityName(critical: boolean): string {
  return critical ? "Highest" : "Medium";
}

export type JiraIssueRef = { key: string; url: string };

export async function createJiraBugIssue(input: {
  summary: string;
  description: string;
  critical: boolean;
}): Promise<JiraIssueRef | null> {
  const config = jiraConfig();
  if (!config) return null;

  try {
    const response = await fetch(`${config.baseUrl}/rest/api/2/issue`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: {
          project: { key: config.projectKey },
          issuetype: { id: BUG_ISSUE_TYPE_ID },
          summary: input.summary.slice(0, 250),
          description: input.description,
          priority: { name: priorityName(input.critical) },
          labels: ["monitor-auto", "ошибка"],
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return null;
    const data = (await response.json()) as { key?: string };
    if (!data.key) return null;
    return { key: data.key, url: `${config.baseUrl}/browse/${data.key}` };
  } catch {
    return null;
  }
}

export async function addJiraComment(issueKey: string, body: string): Promise<boolean> {
  const config = jiraConfig();
  if (!config) return false;

  try {
    const response = await fetch(`${config.baseUrl}/rest/api/2/issue/${issueKey}/comment`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body }),
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
