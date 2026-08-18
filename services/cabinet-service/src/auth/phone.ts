/**
 * Нормализация телефона. Чистая функция без импортов — покрывается тестами.
 *
 * Telegram отдаёт номер из аккаунта, CRM хранит его в произвольном виде:
 * `+7 (999) 123-45-67`, `89991234567`, `7 999 123 45 67`. Сравнивать
 * строки как есть нельзя — не совпадёт почти никогда.
 *
 * Приводим к единому виду: 11 цифр, начинается с 7.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 0) return null;

  // 8 999 ... — российская форма набора
  if (digits.length === 11 && digits.startsWith("8")) return `7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith("7")) return digits;

  // Без кода страны: 999 123 45 67
  if (digits.length === 10) return `7${digits}`;

  // Всё остальное отдаём как есть: зарубежные номера тоже бывают,
  // и портить их приведением к 7 нельзя.
  return digits;
}

/** Совпадают ли номера после нормализации. */
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizePhone(a);
  const right = normalizePhone(b);
  return left !== null && right !== null && left === right;
}
