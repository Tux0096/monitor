/**
 * Нормализация пути в группу. Без импортов — чистая функция, покрывается тестами.
 *
 * Зачем: без группировки каждый товар и каждый заказ породят свою строку
 * в свёртке, и перцентиль будет считаться по выборке из одного замера.
 */
export function normalizePathGroup(rawPath: string): string {
  let path = String(rawPath ?? "").split("?")[0].split("#")[0].trim();
  if (!path.startsWith("/")) path = `/${path}`;
  path = path.replace(/\/+$/, "") || "/";

  const segments = path
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      if (/^\d+$/.test(segment)) return ":id";
      if (/^[0-9a-f-]{32,}$/i.test(segment)) return ":uuid";
      if (/^[0-9a-f]{8,}$/i.test(segment)) return ":id";
      return segment.slice(0, 40);
    });

  // Глубже пяти сегментов группировать бессмысленно — режем хвост.
  const trimmed = segments.slice(0, 5);
  return trimmed.length > 0 ? `/${trimmed.join("/")}` : "/";
}
