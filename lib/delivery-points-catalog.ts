export type DeliveryPointCatalogItem = {
  name: string;
  city?: string | null;
  notes?: string | null;
};

function inferCity(name: string): string | null {
  const trimmed = name.trim();
  if (/^Тольятти/i.test(trimmed)) return "Тольятти";
  if (/^Николаевск/i.test(trimmed)) return "Николаевск";
  if (
    trimmed === "Бухгалтерия" ||
    trimmed === "Центральный офис" ||
    trimmed === "Колл центр" ||
    trimmed === "склад" ||
    trimmed === "Фабрика(П)" ||
    trimmed === "Фабрика"
  ) {
    return "Самара";
  }
  return "Самара";
}

/** Базовый справочник точек Fuji (Самара / Тольятти). */
export const DELIVERY_POINTS_CATALOG: DeliveryPointCatalogItem[] = [
  "Димитр. 110 Люликова",
  "Бухгалтерия",
  "Центральный офис",
  "Колл центр",
  "Сергей Лазо 24 Крохмалев",
  "Новокуйб. Ковалкин",
  "Д.Донского, 12 Кудряшов",
  "Молодогв. 135 Максимова",
  "Димитр 131 Скворцов",
  "Революц. 70 Скворцов",
  "Физкультурная 98 Иконникова",
  "Тольятти Льва Яшина 16 Головин",
  "Дыбенко120.Кошкарова",
  "Долотный, 9(116) Панарин",
  "Крутые Ключи Панарин",
  "склад",
  "Фабрика(П)",
  "Тольятти Карла Маркса 76  Сайгина",
  "Стара Загора 60 Сидоренко",
  "Коммунист.27 Исаева Н.А",
  "Тольятти Автостроителей 56 Сайгина",
  "Николаевск 38 Кудряшов",
  "Просека 163 Кривотулова",
  "Ст.Загора 124 Латухина",
  "Ново-Садов. 24 Головин",
  "Фабрика",
  "Осетинская 12 Прохорова",
  "Лукачева 6 Сафонов В А",
  "Ленинградск. 60 Рожков",
].map((name) => ({
  name,
  city: inferCity(name),
}));

export function normalizeDeliveryPointName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}
