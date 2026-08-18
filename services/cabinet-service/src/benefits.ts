import { sql } from "./db/client.js";
import { isAudienceVisible } from "./audience-db.js";

export class PoolExhausted extends Error {
  constructor() {
    super("benefit code pool exhausted");
    this.name = "PoolExhausted";
  }
}

export class BenefitNotAvailable extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "BenefitNotAvailable";
    this.code = code;
  }
}

export type ClaimResult = {
  code: string;
  issuedAt: string;
  /** true — код уже был выдан раньше, отдаём прежний. */
  alreadyIssued: boolean;
};

/**
 * Выдача персонального промокода.
 *
 * Единственное место сервиса с настоящей конкурентностью. Требования:
 *   — один сотрудник получает один код;
 *   — один код достаётся одному сотруднику;
 *   — двойной клик не выдаёт второй код;
 *   — два одновременных запроса получают разные коды, а не один и тот же.
 *
 * Гарантии дают ограничения базы, а не проверки в коде:
 *   — UNIQUE(benefit_id, worker_id) на cab_benefit_issue отсекает второй
 *     запрос того же сотрудника;
 *   — FOR UPDATE SKIP LOCKED заставляет параллельную транзакцию взять
 *     следующий свободный код, а не ждать и не хватать тот же.
 */
export async function claimBenefit(
  benefitId: number,
  worker: { workerId: number; postId: number | null; departmentId: number | null },
): Promise<ClaimResult> {
  // Видимость и срок действия проверяем до входа в транзакцию выдачи:
  // незачем занимать код, если бонус сотруднику не положен.
  const rows = (await sql`
    SELECT id, kind, is_published, valid_from, valid_to, audience_id
    FROM cab_benefit WHERE id = ${benefitId} LIMIT 1
  `) as Array<{
    id: number;
    kind: string;
    is_published: boolean;
    valid_from: string | null;
    valid_to: string | null;
    audience_id: number | null;
  }>;

  const benefit = rows[0];
  if (!benefit || !benefit.is_published) {
    throw new BenefitNotAvailable("benefit_not_found", "бонус не найден");
  }
  if (benefit.kind !== "personal") {
    throw new BenefitNotAvailable("not_personal", "у этого бонуса нет персональных кодов");
  }

  const now = Date.now();
  if (benefit.valid_from && new Date(benefit.valid_from).getTime() > now) {
    throw new BenefitNotAvailable("not_started", "акция ещё не началась");
  }
  if (benefit.valid_to && new Date(benefit.valid_to).getTime() < now) {
    throw new BenefitNotAvailable("expired", "срок акции истёк");
  }

  const allowed = await isAudienceVisible(benefit.audience_id, worker);
  if (!allowed) {
    throw new BenefitNotAvailable("not_visible", "бонус недоступен для вашей должности или точки");
  }

  return sql.begin(async (tx) => {
    // Шаг 1. Заявка на выдачу. Уникальность (benefit_id, worker_id) —
    // это и есть защита от двойного клика: второй INSERT ничего не вернёт.
    const claimed = (await tx`
      INSERT INTO cab_benefit_issue (benefit_id, worker_id, code_id)
      VALUES (${benefitId}, ${worker.workerId}, NULL)
      ON CONFLICT (benefit_id, worker_id) DO NOTHING
      RETURNING id
    `) as Array<{ id: number }>;

    if (claimed.length === 0) {
      // Код уже выдавали. Отдаём прежний, а не выписываем новый.
      const existing = (await tx`
        SELECT c.code, i.issued_at
        FROM cab_benefit_issue i
        LEFT JOIN cab_benefit_code c ON c.id = i.code_id
        WHERE i.benefit_id = ${benefitId} AND i.worker_id = ${worker.workerId}
        LIMIT 1
      `) as Array<{ code: string | null; issued_at: string }>;

      const row = existing[0];
      if (!row?.code) {
        // Заявка есть, кода нет — прошлая попытка упёрлась в пустой пул.
        throw new PoolExhausted();
      }
      return { code: row.code, issuedAt: row.issued_at, alreadyIssued: true };
    }

    // Шаг 2. Берём следующий свободный код.
    // SKIP LOCKED: параллельная транзакция не будет ждать этот же ряд,
    // а сразу возьмёт следующий — иначе два клиента упёрлись бы в один код.
    const picked = (await tx`
      WITH picked AS (
        SELECT id FROM cab_benefit_code
        WHERE benefit_id = ${benefitId} AND issued_to_worker_id IS NULL
        ORDER BY id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE cab_benefit_code c
      SET issued_to_worker_id = ${worker.workerId},
          issued_at = now(),
          state = 'issued'
      FROM picked
      WHERE c.id = picked.id
      RETURNING c.id, c.code, c.issued_at
    `) as Array<{ id: number; code: string; issued_at: string }>;

    if (picked.length === 0) {
      // Пул исчерпан. Откатываем заявку, чтобы сотрудник смог получить код
      // после пополнения — иначе он навсегда останется с пустой выдачей.
      throw new PoolExhausted();
    }

    await tx`
      UPDATE cab_benefit_issue SET code_id = ${picked[0].id}
      WHERE benefit_id = ${benefitId} AND worker_id = ${worker.workerId}
    `;

    return {
      code: picked[0].code,
      issuedAt: picked[0].issued_at,
      alreadyIssued: false,
    };
  }) as Promise<ClaimResult>;
}

/** Статистика пула для админки: выдано, погашено, осталось. */
export async function benefitStats(benefitId: number): Promise<{
  total: number;
  issued: number;
  redeemed: number;
  free: number;
}> {
  const [row] = (await sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE issued_to_worker_id IS NOT NULL)::int AS issued,
           count(*) FILTER (WHERE redeemed_at IS NOT NULL)::int AS redeemed,
           count(*) FILTER (WHERE issued_to_worker_id IS NULL)::int AS free
    FROM cab_benefit_code WHERE benefit_id = ${benefitId}
  `) as Array<{ total: number; issued: number; redeemed: number; free: number }>;
  return row ?? { total: 0, issued: 0, redeemed: 0, free: 0 };
}
