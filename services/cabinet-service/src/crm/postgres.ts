import postgres from "postgres";

import { normalizePhone } from "../auth/phone.js";
import type {
  CRMHealth,
  CRMReader,
  DepartmentRef,
  MaterialValue,
  Page,
  PersonName,
  Ref,
  WorkerCard,
  WorkerLogins,
  WorkTime,
} from "./types.js";

/**
 * Контракт схемы из §3 промта. Сверен с боевой базой fuji_new.
 *
 * Если чего-то не хватает — сервис обязан упасть на старте с внятным
 * сообщением. Молча отдавать пустые права нельзя: это тихая потеря
 * доступа у всех сотрудников сразу, и заметят её не скоро.
 */
export const REQUIRED_SCHEMA: Record<string, string[]> = {
  workers: [
    "id",
    "f_name",
    "l_name",
    "o_name",
    "phone_number",
    "telegram_id",
    "post_id",
    "department_id",
    "state",
    "employment_date",
    "iiko_id",
  ],
  posts: ["id", "name"],
  departments: ["id", "name", "address", "city", "company_id"],
  companies: ["id", "name"],
  account_logins: [
    "worker_id",
    "cop_mail_login",
    "liko_login",
    "bitrix_login",
    "pyrus_login",
    "check_office_login",
    "pbi_login",
  ],
  // quanity — опечатка в их схеме. Так и есть в базе, исправлять нельзя.
  material_values: [
    "worker_id",
    "item",
    "quanity",
    "price",
    "inventory_number",
    "issue_date",
    "return_date",
  ],
  work_times: [
    "worker_id",
    "day",
    "work_begin",
    "work_end",
    "work_duration",
    "rating",
    "fine",
    "department_id",
  ],
  subordinations: ["chief_id", "employee_id"],
};

const SELECT_CARD = `
  SELECT w.id, w.l_name, w.f_name, w.o_name, w.phone_number, w.telegram_id,
         w.state, w.employment_date, w.iiko_id,
         p.id AS post_id, p.name AS post,
         d.id AS department_id, d.name AS department, d.city,
         c.id AS company_id, c.name AS company
  FROM workers w
  LEFT JOIN posts p       ON p.id = w.post_id
  LEFT JOIN departments d ON d.id = w.department_id
  LEFT JOIN companies  c  ON c.id = d.company_id
`;

type CardRow = {
  id: number;
  l_name: string | null;
  f_name: string | null;
  o_name: string | null;
  phone_number: string | null;
  telegram_id: string | number | null;
  state: number | null;
  employment_date: Date | string | null;
  iiko_id: string | null;
  post_id: number | null;
  post: string | null;
  department_id: number | null;
  department: string | null;
  city: string | null;
  company_id: number | null;
  company: string | null;
};

function toDateString(value: Date | string | null): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toCard(row: CardRow): WorkerCard {
  return {
    workerId: row.id,
    lastName: row.l_name,
    firstName: row.f_name,
    middleName: row.o_name,
    phone: row.phone_number,
    telegramId: row.telegram_id == null ? null : Number(row.telegram_id),
    postId: row.post_id,
    post: row.post,
    departmentId: row.department_id,
    department: row.department,
    companyId: row.company_id,
    company: row.company,
    city: row.city,
    employmentDate: toDateString(row.employment_date),
    // state = 1 — действующий. Фильтр применяется на каждом входе,
    // а не только при первой привязке.
    isActive: row.state === 1,
    iikoId: row.iiko_id,
  };
}

export class SchemaContractError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(
      `Схема CRM не соответствует контракту. Отсутствует: ${missing.join(", ")}. ` +
        `Сервис остановлен намеренно: продолжать с неполной схемой значит ` +
        `тихо отобрать доступ у сотрудников.`,
    );
    this.name = "SchemaContractError";
    this.missing = missing;
  }
}

export class PostgresCRMReader implements CRMReader {
  private sql: postgres.Sql;

  constructor(dsn: string, poolSize = 5, statementTimeoutMs = 3000) {
    // Только чтение. Роль в базе тоже должна быть ограничена SELECT —
    // на уровне приложения это лишь второй рубеж.
    this.sql = postgres(dsn, {
      max: poolSize,
      // statement_timeout типизирован как number, хотя Postgres принимает
      // и строку с единицами. Держим миллисекунды числом.
      connection: { statement_timeout: statementTimeoutMs },
      prepare: false,
    });
  }

  /** Проверка наличия таблиц и колонок. Вызывается на старте. */
  async verifySchema(): Promise<string[]> {
    const tables = Object.keys(REQUIRED_SCHEMA);
    const rows = (await this.sql`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY(${tables})
    `) as Array<{ table_name: string; column_name: string }>;

    const present = new Map<string, Set<string>>();
    for (const row of rows) {
      const set = present.get(row.table_name) ?? new Set<string>();
      set.add(row.column_name);
      present.set(row.table_name, set);
    }

    const missing: string[] = [];
    for (const [table, columns] of Object.entries(REQUIRED_SCHEMA)) {
      const found = present.get(table);
      if (!found) {
        missing.push(`таблица ${table}`);
        continue;
      }
      for (const column of columns) {
        if (!found.has(column)) missing.push(`${table}.${column}`);
      }
    }
    return missing;
  }

  async getWorkerByTelegramId(tgId: number): Promise<WorkerCard | null> {
    const rows = (await this.sql`
      ${this.sql.unsafe(SELECT_CARD)} WHERE w.telegram_id = ${tgId} LIMIT 1
    `) as CardRow[];
    return rows[0] ? toCard(rows[0]) : null;
  }

  async getWorkerByPhone(phone: string): Promise<WorkerCard | null> {
    const target = normalizePhone(phone);
    if (!target) return null;
    // Номера в CRM записаны как попало, поэтому сравниваем нормализованными:
    // оставляем только цифры и отбрасываем ведущую 8/7.
    const rows = (await this.sql`
      ${this.sql.unsafe(SELECT_CARD)}
      WHERE right(regexp_replace(coalesce(w.phone_number, ''), '\\D', '', 'g'), 10)
          = right(${target}, 10)
      LIMIT 1
    `) as CardRow[];
    return rows[0] ? toCard(rows[0]) : null;
  }

  async getWorkerById(workerId: number): Promise<WorkerCard | null> {
    const rows = (await this.sql`
      ${this.sql.unsafe(SELECT_CARD)} WHERE w.id = ${workerId} LIMIT 1
    `) as CardRow[];
    return rows[0] ? toCard(rows[0]) : null;
  }

  async getWorkerLogins(workerId: number): Promise<WorkerLogins | null> {
    const rows = (await this.sql`
      SELECT cop_mail_login, liko_login, bitrix_login, pyrus_login,
             check_office_login, pbi_login
      FROM account_logins WHERE worker_id = ${workerId} LIMIT 1
    `) as Array<Record<string, string | null>>;
    const row = rows[0];
    if (!row) return null;
    return {
      copMail: row.cop_mail_login ?? null,
      liko: row.liko_login ?? null,
      bitrix: row.bitrix_login ?? null,
      pyrus: row.pyrus_login ?? null,
      checkOffice: row.check_office_login ?? null,
      pbi: row.pbi_login ?? null,
    };
  }

  async getMaterialValues(workerId: number): Promise<MaterialValue[]> {
    const rows = (await this.sql`
      SELECT item, quanity, price, inventory_number, issue_date, return_date
      FROM material_values WHERE worker_id = ${workerId}
      ORDER BY issue_date DESC NULLS LAST
    `) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      item: row.item == null ? null : String(row.item),
      quantity: row.quanity == null ? null : Number(row.quanity),
      price: row.price == null ? null : Number(row.price),
      inventoryNumber: row.inventory_number == null ? null : String(row.inventory_number),
      issueDate: toDateString(row.issue_date as Date | string | null),
      returnDate: toDateString(row.return_date as Date | string | null),
    }));
  }

  async getWorktimes(
    workerId: number,
    limit: number,
    cursor: string | null,
  ): Promise<Page<WorkTime>> {
    // Keyset по дню, не offset: при вставке новых смен страницы не съезжают.
    const rows = (await this.sql`
      SELECT wt.day, wt.work_begin, wt.work_end, wt.work_duration,
             wt.rating, wt.fine, wt.department_id, d.name AS department
      FROM work_times wt
      LEFT JOIN departments d ON d.id = wt.department_id
      WHERE wt.worker_id = ${workerId}
        AND (${cursor}::text IS NULL OR wt.day < ${cursor}::date)
      ORDER BY wt.day DESC
      LIMIT ${limit + 1}
    `) as Array<Record<string, unknown>>;

    const hasMore = rows.length > limit;
    const items: WorkTime[] = rows.slice(0, limit).map((row) => ({
      day: toDateString(row.day as Date | string | null),
      begin: row.work_begin == null ? null : String(row.work_begin),
      end: row.work_end == null ? null : String(row.work_end),
      durationHours: row.work_duration == null ? null : Number(row.work_duration),
      rating: row.rating == null ? null : Number(row.rating),
      fine: row.fine == null ? null : Number(row.fine),
      departmentId: row.department_id == null ? null : Number(row.department_id),
      department: row.department == null ? null : String(row.department),
    }));

    return { items, nextCursor: hasMore ? (items.at(-1)?.day ?? null) : null };
  }

  async getChief(workerId: number): Promise<PersonName | null> {
    const rows = (await this.sql`
      SELECT c.l_name, c.f_name, c.o_name
      FROM subordinations s
      JOIN workers c ON c.id = s.chief_id
      WHERE s.employee_id = ${workerId}
      LIMIT 1
    `) as Array<{ l_name: string | null; f_name: string | null; o_name: string | null }>;
    const row = rows[0];
    return row ? { lastName: row.l_name, firstName: row.f_name, middleName: row.o_name } : null;
  }

  async listPosts(): Promise<Ref[]> {
    return (await this.sql`SELECT id, name FROM posts ORDER BY name`) as unknown as Ref[];
  }

  async listDepartments(): Promise<DepartmentRef[]> {
    const rows = (await this.sql`
      SELECT id, name, company_id, city, address FROM departments ORDER BY name
    `) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: Number(row.id),
      name: String(row.name),
      companyId: row.company_id == null ? null : Number(row.company_id),
      city: row.city == null ? null : String(row.city),
      address: row.address == null ? null : String(row.address),
    }));
  }

  async listCompanies(): Promise<Ref[]> {
    return (await this.sql`SELECT id, name FROM companies ORDER BY name`) as unknown as Ref[];
  }

  async healthcheck(): Promise<CRMHealth> {
    try {
      const missing = await this.verifySchema();
      return {
        source: "postgres",
        ok: missing.length === 0,
        missing,
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        source: "postgres",
        ok: false,
        missing: [],
        checkedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}
