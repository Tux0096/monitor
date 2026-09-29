import type { Appeal, CourierProfile } from "@/lib/appeals";

export type AppealsResponse = {
  appeals: Appeal[];
};

export type CourierDraft = Pick<
  CourierProfile,
  "displayName" | "lastName" | "phone" | "phoneModel" | "os" | "appVersion" | "notes"
> & {
  tagsText: string;
  pointId: string;
};

export type AppealDraft = {
  issueText: string;
  resultText: string;
  pointId: string;
};

export function toAppealDraft(appeal: Appeal): AppealDraft {
  return {
    issueText: appeal.issueText,
    resultText: appeal.resultText ?? appeal.aiSuggestedReply ?? appeal.operatorReply ?? "",
    pointId: appeal.pointId ?? "",
  };
}

export function toCourierDraft(appeal: Appeal): CourierDraft {
  const profile = appeal.courierProfile;
  return {
    displayName: profile?.displayName ?? appeal.senderName ?? "",
    lastName: profile?.lastName ?? appeal.courierLastName ?? "",
    phone: profile?.phone ?? appeal.phone ?? "",
    phoneModel: profile?.phoneModel ?? appeal.phoneModel ?? "",
    os: profile?.os ?? appeal.os ?? "",
    appVersion: profile?.appVersion ?? appeal.appVersion ?? "",
    notes: profile?.notes ?? "",
    tagsText: profile?.tags?.join(", ") ?? "",
    pointId: profile?.pointId ?? "",
  };
}

/** Черновик отличается от сохранённого обращения — есть что сохранять. */
export function isAppealDraftDirty(appeal: Appeal, draft: AppealDraft): boolean {
  const saved = toAppealDraft(appeal);
  return (
    saved.issueText !== draft.issueText ||
    saved.resultText !== draft.resultText ||
    saved.pointId !== draft.pointId
  );
}

export function isAppealInDateRange(createdAt: string, dateFrom: string, dateTo: string) {
  if (!dateFrom && !dateTo) return true;

  const timestamp = new Date(createdAt).getTime();
  let from = dateFrom ? startOfDay(dateFrom) : null;
  let to = dateTo ? endOfDay(dateTo) : null;

  if (from != null && to != null && from > to) {
    from = startOfDay(dateTo);
    to = endOfDay(dateFrom);
  }

  if (from != null && timestamp < from) return false;
  if (to != null && timestamp > to) return false;
  return true;
}

function startOfDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
}

function endOfDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
}
