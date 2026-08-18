/**
 * Модель доступа (§5 промта).
 *
 *   видно(сущность, работник) :=
 *        audience.is_everyone
 *     OR СУЩЕСТВУЕТ правило, где
 *          (список должностей  пуст ИЛИ worker.post_id       ∈ список)
 *        И (список предприятий пуст ИЛИ worker.department_id ∈ список)
 *
 * Внутри правила — И, между правилами — ИЛИ. Это даёт и «управляющие
 * в Самаре» (одно правило, два списка), и «все управляющие + все сотрудники
 * Самары» (два правила).
 *
 * Пустая аудитория без правил и без is_everyone не видна никому —
 * так и задумано: черновик не должен утечь по недосмотру.
 */

export type AudienceRule = {
  postIds: number[];
  departmentIds: number[];
};

export type Audience = {
  isEveryone: boolean;
  rules: AudienceRule[];
};

export type WorkerScope = {
  postId: number | null;
  departmentId: number | null;
};

/**
 * Чистая реализация правила — эталон для тестов и для сверки с SQL.
 *
 * В рантайме фильтрация выполняется в SQL (см. VISIBLE_SQL): скрытая статья
 * не должна доезжать до фронта ни в каком виде, поэтому отбор идёт
 * в запросе, а не в клиенте.
 */
export function isVisible(audience: Audience, worker: WorkerScope): boolean {
  if (audience.isEveryone) return true;

  return audience.rules.some((rule) => {
    const postOk =
      rule.postIds.length === 0 ||
      (worker.postId != null && rule.postIds.includes(worker.postId));

    const departmentOk =
      rule.departmentIds.length === 0 ||
      (worker.departmentId != null && rule.departmentIds.includes(worker.departmentId));

    return postOk && departmentOk;
  });
}

/**
 * Условие видимости для SQL-запросов.
 *
 * Подставляется в WHERE как `AND (<VISIBLE_SQL>)`. Параметры:
 *   $1 — audience_id проверяемой сущности
 *   $2 — worker.post_id
 *   $3 — worker.department_id
 *
 * Держим рядом с isVisible намеренно: две реализации одного правила
 * обязаны сходиться, и тест сверяет их на одних и тех же данных.
 */
export const VISIBLE_SQL = `
  EXISTS (
    SELECT 1 FROM cab_audience a
    WHERE a.id = $1 AND a.is_everyone
  )
  OR EXISTS (
    SELECT 1
    FROM cab_audience_rule r
    WHERE r.audience_id = $1
      AND (
        NOT EXISTS (SELECT 1 FROM cab_audience_rule_post rp WHERE rp.rule_id = r.id)
        OR EXISTS (
          SELECT 1 FROM cab_audience_rule_post rp
          WHERE rp.rule_id = r.id AND rp.post_id = $2
        )
      )
      AND (
        NOT EXISTS (SELECT 1 FROM cab_audience_rule_department rd WHERE rd.rule_id = r.id)
        OR EXISTS (
          SELECT 1 FROM cab_audience_rule_department rd
          WHERE rd.rule_id = r.id AND rd.department_id = $3
        )
      )
  )
`;
