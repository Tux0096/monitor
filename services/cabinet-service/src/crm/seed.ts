import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

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

type RawWorker = {
  id: number;
  l_name: string | null;
  f_name: string | null;
  o_name: string | null;
  phone: string | null;
  telegram_id: number | null;
  post_id: number | null;
  department_id: number | null;
  employment_date: string | null;
  state: number;
  iiko_id: string | null;
};

type Fixtures = {
  companies: Ref[];
  departments: Array<{
    id: number;
    name: string;
    city: string | null;
    address: string | null;
    company_id: number | null;
  }>;
  posts: Ref[];
  workers: RawWorker[];
  subordinations: Array<{ chief_id: number; employee_id: number }>;
  account_logins: Array<Record<string, string | number | null>>;
  material_values: Array<Record<string, string | number | null>>;
  work_times: Array<Record<string, string | number | null>>;
};

/**
 * Читатель CRM из фикстур.
 *
 * Работает без единого внешнего подключения — это и есть смысл режима:
 * разрабатывать и приёмить кабинет, не касаясь персональных данных
 * реальных сотрудников.
 *
 * Форма ответа обязана совпадать с PostgresCRMReader: один и тот же
 * набор контрактных тестов прогоняется на обеих реализациях.
 */
export class SeedCRMReader implements CRMReader {
  private data: Fixtures | null = null;

  constructor(private readonly fixturesPath?: string) {}

  private async load(): Promise<Fixtures> {
    if (this.data) return this.data;
    const here = path.dirname(fileURLToPath(import.meta.url));
    const file = this.fixturesPath ?? path.join(here, "fixtures.yaml");
    const raw = await readFile(file, "utf-8");
    this.data = YAML.parse(raw) as Fixtures;
    return this.data;
  }

  private async toCard(worker: RawWorker): Promise<WorkerCard> {
    const data = await this.load();
    const department = data.departments.find((d) => d.id === worker.department_id) ?? null;
    const company = department
      ? (data.companies.find((c) => c.id === department.company_id) ?? null)
      : null;
    const post = data.posts.find((p) => p.id === worker.post_id) ?? null;

    return {
      workerId: worker.id,
      lastName: worker.l_name,
      firstName: worker.f_name,
      middleName: worker.o_name,
      phone: worker.phone,
      telegramId: worker.telegram_id,
      postId: worker.post_id,
      post: post?.name ?? null,
      departmentId: worker.department_id,
      department: department?.name ?? null,
      companyId: company?.id ?? null,
      company: company?.name ?? null,
      city: department?.city ?? null,
      employmentDate: worker.employment_date,
      isActive: worker.state === 1,
      iikoId: worker.iiko_id,
    };
  }

  async getWorkerByTelegramId(tgId: number): Promise<WorkerCard | null> {
    const data = await this.load();
    const worker = data.workers.find((w) => w.telegram_id === tgId);
    return worker ? this.toCard(worker) : null;
  }

  async getWorkerByPhone(phone: string): Promise<WorkerCard | null> {
    const data = await this.load();
    const target = normalizePhone(phone);
    if (!target) return null;
    const worker = data.workers.find((w) => normalizePhone(w.phone) === target);
    return worker ? this.toCard(worker) : null;
  }

  async getWorkerById(workerId: number): Promise<WorkerCard | null> {
    const data = await this.load();
    const worker = data.workers.find((w) => w.id === workerId);
    return worker ? this.toCard(worker) : null;
  }

  async getWorkerLogins(workerId: number): Promise<WorkerLogins | null> {
    const data = await this.load();
    const row = data.account_logins.find((l) => l.worker_id === workerId);
    if (!row) return null;
    const str = (key: string) => (row[key] == null ? null : String(row[key]));
    return {
      copMail: str("cop_mail_login"),
      liko: str("liko_login"),
      bitrix: str("bitrix_login"),
      pyrus: str("pyrus_login"),
      checkOffice: str("check_office_login"),
      pbi: str("pbi_login"),
    };
  }

  async getMaterialValues(workerId: number): Promise<MaterialValue[]> {
    const data = await this.load();
    return data.material_values
      .filter((m) => m.worker_id === workerId)
      .map((m) => ({
        item: m.item == null ? null : String(m.item),
        quantity: m.quanity == null ? null : Number(m.quanity),
        price: m.price == null ? null : Number(m.price),
        inventoryNumber: m.inventory_number == null ? null : String(m.inventory_number),
        issueDate: m.issue_date == null ? null : String(m.issue_date),
        returnDate: m.return_date == null ? null : String(m.return_date),
      }));
  }

  async getWorktimes(
    workerId: number,
    limit: number,
    cursor: string | null,
  ): Promise<Page<WorkTime>> {
    const data = await this.load();
    const departments = new Map(data.departments.map((d) => [d.id, d.name]));

    // Keyset по дню: сортировка по убыванию, курсор — последний отданный день.
    const rows = data.work_times
      .filter((w) => w.worker_id === workerId)
      .sort((a, b) => String(b.day).localeCompare(String(a.day)))
      .filter((w) => (cursor ? String(w.day) < cursor : true));

    const page = rows.slice(0, limit);
    const items: WorkTime[] = page.map((w) => ({
      day: w.day == null ? null : String(w.day),
      begin: w.work_begin == null ? null : String(w.work_begin),
      end: w.work_end == null ? null : String(w.work_end),
      durationHours: w.work_duration == null ? null : Number(w.work_duration),
      rating: w.rating == null ? null : Number(w.rating),
      fine: w.fine == null ? null : Number(w.fine),
      departmentId: w.department_id == null ? null : Number(w.department_id),
      department:
        w.department_id == null ? null : (departments.get(Number(w.department_id)) ?? null),
    }));

    return {
      items,
      nextCursor: rows.length > limit ? (items.at(-1)?.day ?? null) : null,
    };
  }

  async getChief(workerId: number): Promise<PersonName | null> {
    const data = await this.load();
    const link = data.subordinations.find((s) => s.employee_id === workerId);
    if (!link) return null;
    const chief = data.workers.find((w) => w.id === link.chief_id);
    if (!chief) return null;
    return { lastName: chief.l_name, firstName: chief.f_name, middleName: chief.o_name };
  }

  async listPosts(): Promise<Ref[]> {
    return (await this.load()).posts;
  }

  async listDepartments(): Promise<DepartmentRef[]> {
    const data = await this.load();
    return data.departments.map((d) => ({
      id: d.id,
      name: d.name,
      companyId: d.company_id,
      city: d.city,
      address: d.address,
    }));
  }

  async listCompanies(): Promise<Ref[]> {
    return (await this.load()).companies;
  }

  async healthcheck(): Promise<CRMHealth> {
    try {
      const data = await this.load();
      return {
        source: "seed",
        ok: data.workers.length > 0,
        missing: [],
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        source: "seed",
        ok: false,
        missing: [],
        checkedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
