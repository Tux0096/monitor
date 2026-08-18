/**
 * Формы данных CRM. Общие для обеих реализаций читателя.
 *
 * Ни один модуль выше слоя crm/ не должен знать, откуда пришли эти объекты:
 * из фикстур или из боевой базы. Никаких `if (source === "seed")` в бизнес-логике.
 */

export type Ref = { id: number; name: string };

export type DepartmentRef = Ref & {
  companyId: number | null;
  city: string | null;
  address: string | null;
};

export type PersonName = {
  lastName: string | null;
  firstName: string | null;
  middleName: string | null;
};

export type WorkerCard = {
  workerId: number;
  lastName: string | null;
  firstName: string | null;
  middleName: string | null;
  phone: string | null;
  telegramId: number | null;
  postId: number | null;
  post: string | null;
  departmentId: number | null;
  department: string | null;
  companyId: number | null;
  company: string | null;
  city: string | null;
  employmentDate: string | null;
  /** true — сотрудник действующий. Уволенный доступа не получает. */
  isActive: boolean;
  iikoId: string | null;
};

export type WorkerLogins = {
  copMail: string | null;
  liko: string | null;
  bitrix: string | null;
  pyrus: string | null;
  checkOffice: string | null;
  pbi: string | null;
};

export type MaterialValue = {
  item: string | null;
  /** Опечатка `quanity` — так в схеме CRM. Наружу отдаём правильным именем. */
  quantity: number | null;
  price: number | null;
  inventoryNumber: string | null;
  issueDate: string | null;
  returnDate: string | null;
};

export type WorkTime = {
  day: string | null;
  begin: string | null;
  end: string | null;
  durationHours: number | null;
  rating: number | null;
  fine: number | null;
  departmentId: number | null;
  department: string | null;
};

export type Page<T> = {
  items: T[];
  /** Keyset-курсор. null — дальше пусто. Offset не используем. */
  nextCursor: string | null;
};

export type CRMHealth = {
  source: "seed" | "postgres";
  ok: boolean;
  /** Результат контрактной проверки схемы: чего не хватает. */
  missing: string[];
  checkedAt: string;
  error?: string;
};

/**
 * Единственная дверь в чужую базу.
 *
 * Реализаций две — фикстуры и боевой Postgres. Обе обязаны отдавать
 * одинаковую форму ответа: один и тот же набор тестов прогоняется на обеих.
 */
export interface CRMReader {
  getWorkerByTelegramId(tgId: number): Promise<WorkerCard | null>;
  getWorkerByPhone(phone: string): Promise<WorkerCard | null>;
  getWorkerById(workerId: number): Promise<WorkerCard | null>;
  getWorkerLogins(workerId: number): Promise<WorkerLogins | null>;
  getMaterialValues(workerId: number): Promise<MaterialValue[]>;
  getWorktimes(workerId: number, limit: number, cursor: string | null): Promise<Page<WorkTime>>;
  getChief(workerId: number): Promise<PersonName | null>;
  listPosts(): Promise<Ref[]>;
  listDepartments(): Promise<DepartmentRef[]>;
  listCompanies(): Promise<Ref[]>;
  healthcheck(): Promise<CRMHealth>;
}
