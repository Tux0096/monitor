export type ParsedTelegramAccount = {
  userId: string | null;
  username: string | null;
  raw: string;
};

export type ParsedMaxAccount = {
  userId: string | null;
  raw: string;
};

export type EmployeeSenderMatch = {
  platformUserId: string;
  telegramUsername?: string | null;
  source: "max" | "telegram";
};

export function parseTelegramAccount(value: string | null | undefined): ParsedTelegramAccount | null {
  const raw = value?.trim();
  if (!raw) return null;

  if (raw.startsWith("tg:")) {
    const userId = raw.slice(3).trim();
    return userId ? { userId, username: null, raw } : null;
  }

  if (/^\d+$/.test(raw)) {
    return { userId: raw, username: null, raw };
  }

  const usernameMatch = raw.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me|telegram\.dog)\/([a-zA-Z0-9_]{3,32})/i);
  if (usernameMatch) {
    return { userId: null, username: usernameMatch[1].toLowerCase(), raw };
  }

  const tgUserMatch = raw.match(/tg:\/\/user\?id=(\d+)/i);
  if (tgUserMatch) {
    return { userId: tgUserMatch[1], username: null, raw };
  }

  if (/^@[a-zA-Z0-9_]{3,32}$/.test(raw)) {
    return { userId: null, username: raw.slice(1).toLowerCase(), raw };
  }

  if (/^[a-zA-Z0-9_]{3,32}$/.test(raw)) {
    return { userId: null, username: raw.toLowerCase(), raw };
  }

  return { userId: null, username: null, raw };
}

export function parseMaxAccount(value: string | null | undefined): ParsedMaxAccount | null {
  const raw = value?.trim();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    return { userId: raw, raw };
  }

  const idMatch = raw.match(/(?:max\.ru|on\.me)[^\d]*(\d{4,})/i);
  if (idMatch) {
    return { userId: idMatch[1], raw };
  }

  const queryMatch = raw.match(/[?&](?:user_?id|uid)=(\d+)/i);
  if (queryMatch) {
    return { userId: queryMatch[1], raw };
  }

  return { userId: null, raw };
}

export function normalizeTelegramAccountInput(value: string | null | undefined): string | null {
  const parsed = parseTelegramAccount(value);
  if (!parsed) return null;
  if (parsed.userId) return `tg://user?id=${parsed.userId}`;
  if (parsed.username) return `https://t.me/${parsed.username}`;
  return parsed.raw.trim() || null;
}

export function normalizeMaxAccountInput(value: string | null | undefined): string | null {
  const parsed = parseMaxAccount(value);
  if (!parsed) return null;
  return parsed.userId ?? parsed.raw.trim();
}

export function deriveAutoAccounts(
  platformUserId: string,
  telegramUsername?: string | null,
): { telegramAccount: string | null; maxAccount: string | null } {
  if (platformUserId.startsWith("tg:")) {
    const userId = platformUserId.slice(3);
    if (telegramUsername?.trim()) {
      return { telegramAccount: `https://t.me/${telegramUsername.trim()}`, maxAccount: null };
    }
    return { telegramAccount: userId ? `tg://user?id=${userId}` : null, maxAccount: null };
  }

  return { telegramAccount: null, maxAccount: platformUserId };
}

export function matchesTelegramAccount(
  stored: string | null | undefined,
  match: EmployeeSenderMatch,
): boolean {
  const parsed = parseTelegramAccount(stored);
  if (!parsed) return false;

  const senderUserId = match.platformUserId.startsWith("tg:")
    ? match.platformUserId.slice(3)
    : match.platformUserId;

  if (parsed.userId && parsed.userId === senderUserId) return true;

  const username = match.telegramUsername?.trim().toLowerCase();
  if (parsed.username && username && parsed.username === username) return true;

  return false;
}

export function matchesMaxAccount(
  stored: string | null | undefined,
  match: EmployeeSenderMatch,
): boolean {
  const parsed = parseMaxAccount(stored);
  if (!parsed?.userId) return false;

  const senderUserId = match.platformUserId.startsWith("tg:")
    ? null
    : match.platformUserId;

  return Boolean(senderUserId && parsed.userId === senderUserId);
}

export function employeeMatchesAdminAccounts(
  row: {
    isAdmin: boolean;
    platformUserId: string;
    telegramAccount: string | null;
    maxAccount: string | null;
  },
  match: EmployeeSenderMatch,
): boolean {
  if (!row.isAdmin) return false;
  if (row.platformUserId === match.platformUserId) return true;
  if (match.source === "telegram" && matchesTelegramAccount(row.telegramAccount, match)) return true;
  if (match.source === "max" && matchesMaxAccount(row.maxAccount, match)) return true;
  return false;
}
