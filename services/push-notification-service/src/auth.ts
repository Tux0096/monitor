export function verifyServiceSecret(header: string | string[] | undefined): boolean {
  const secret = process.env.PERFORMANCE_IMPORT_SECRET?.trim();
  if (!secret) return false;
  const value = Array.isArray(header) ? header[0] : header;
  return value?.trim() === secret;
}

export function getUserEmailFromHeader(
  header: string | string[] | undefined,
): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  const email = value?.trim();
  return email || null;
}
