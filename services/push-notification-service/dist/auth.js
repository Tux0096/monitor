export function verifyServiceSecret(header) {
    const secret = process.env.PERFORMANCE_IMPORT_SECRET?.trim();
    if (!secret)
        return false;
    const value = Array.isArray(header) ? header[0] : header;
    return value?.trim() === secret;
}
export function getUserEmailFromHeader(header) {
    const value = Array.isArray(header) ? header[0] : header;
    const email = value?.trim();
    return email || null;
}
