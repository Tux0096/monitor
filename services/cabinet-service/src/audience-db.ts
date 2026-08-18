import { sql } from "./db/client.js";

export type WorkerScopeDb = {
  postId: number | null;
  departmentId: number | null;
};

/**
 * Условие видимости для встраивания в WHERE.
 *
 * Возвращает фрагмент postgres.js, а не строку с $1/$2/$3: нумерованные
 * плейсхолдеры не совмещаются с tagged template, и попытка их подставить
 * заканчивается либо синтаксической ошибкой, либо — что хуже — инъекцией.
 *
 * Отбор идёт в SQL, а не в клиенте: скрытая статья не должна доезжать
 * до фронта ни в каком виде.
 */
export function visibleTo(audienceColumn: string, worker: WorkerScopeDb) {
  const column = sql.unsafe(audienceColumn);
  return sql`(
    ${column} IS NULL
    OR EXISTS (
      SELECT 1 FROM cab_audience a
      WHERE a.id = ${column} AND a.is_everyone
    )
    OR EXISTS (
      SELECT 1 FROM cab_audience_rule r
      WHERE r.audience_id = ${column}
        AND (
          NOT EXISTS (SELECT 1 FROM cab_audience_rule_post rp WHERE rp.rule_id = r.id)
          OR EXISTS (
            SELECT 1 FROM cab_audience_rule_post rp
            WHERE rp.rule_id = r.id AND rp.post_id = ${worker.postId}
          )
        )
        AND (
          NOT EXISTS (SELECT 1 FROM cab_audience_rule_department rd WHERE rd.rule_id = r.id)
          OR EXISTS (
            SELECT 1 FROM cab_audience_rule_department rd
            WHERE rd.rule_id = r.id AND rd.department_id = ${worker.departmentId}
          )
        )
    )
  )`;
}

/** Точечная проверка одной аудитории — для действий вроде выдачи промокода. */
export async function isAudienceVisible(
  audienceId: number | null,
  worker: WorkerScopeDb,
): Promise<boolean> {
  if (audienceId == null) return true;
  const [row] = (await sql`
    SELECT (
      EXISTS (SELECT 1 FROM cab_audience a WHERE a.id = ${audienceId} AND a.is_everyone)
      OR EXISTS (
        SELECT 1 FROM cab_audience_rule r
        WHERE r.audience_id = ${audienceId}
          AND (
            NOT EXISTS (SELECT 1 FROM cab_audience_rule_post rp WHERE rp.rule_id = r.id)
            OR EXISTS (
              SELECT 1 FROM cab_audience_rule_post rp
              WHERE rp.rule_id = r.id AND rp.post_id = ${worker.postId}
            )
          )
          AND (
            NOT EXISTS (SELECT 1 FROM cab_audience_rule_department rd WHERE rd.rule_id = r.id)
            OR EXISTS (
              SELECT 1 FROM cab_audience_rule_department rd
              WHERE rd.rule_id = r.id AND rd.department_id = ${worker.departmentId}
            )
          )
      )
    ) AS ok
  `) as Array<{ ok: boolean }>;
  return row?.ok === true;
}
