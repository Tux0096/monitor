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
 *
 * Внутренние алиасы с префиксом _cab_ намеренно: короткие `a`, `r`, `rp`
 * перекрывали внешние алиасы вызывающего запроса. Например в списке
 * разделов БЗ статья тоже алиасилась как `a`, и `a.audience_id`
 * разрешался в колонку cab_audience, которой там нет.
 */
export function visibleTo(audienceColumn: string, worker: WorkerScopeDb) {
  const column = sql.unsafe(audienceColumn);
  return sql`(
    ${column} IS NULL
    OR EXISTS (
      SELECT 1 FROM cab_audience _cab_a
      WHERE _cab_a.id = ${column} AND _cab_a.is_everyone
    )
    OR EXISTS (
      SELECT 1 FROM cab_audience_rule _cab_r
      WHERE _cab_r.audience_id = ${column}
        AND (
          NOT EXISTS (SELECT 1 FROM cab_audience_rule_post _cab_rp WHERE _cab_rp.rule_id = _cab_r.id)
          OR EXISTS (
            SELECT 1 FROM cab_audience_rule_post _cab_rp
            WHERE _cab_rp.rule_id = _cab_r.id AND _cab_rp.post_id = ${worker.postId}
          )
        )
        AND (
          NOT EXISTS (SELECT 1 FROM cab_audience_rule_department _cab_rd WHERE _cab_rd.rule_id = _cab_r.id)
          OR EXISTS (
            SELECT 1 FROM cab_audience_rule_department _cab_rd
            WHERE _cab_rd.rule_id = _cab_r.id AND _cab_rd.department_id = ${worker.departmentId}
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
      EXISTS (SELECT 1 FROM cab_audience _cab_a WHERE _cab_a.id = ${audienceId} AND _cab_a.is_everyone)
      OR EXISTS (
        SELECT 1 FROM cab_audience_rule _cab_r
        WHERE _cab_r.audience_id = ${audienceId}
          AND (
            NOT EXISTS (SELECT 1 FROM cab_audience_rule_post _cab_rp WHERE _cab_rp.rule_id = _cab_r.id)
            OR EXISTS (
              SELECT 1 FROM cab_audience_rule_post _cab_rp
              WHERE _cab_rp.rule_id = _cab_r.id AND _cab_rp.post_id = ${worker.postId}
            )
          )
          AND (
            NOT EXISTS (SELECT 1 FROM cab_audience_rule_department _cab_rd WHERE _cab_rd.rule_id = _cab_r.id)
            OR EXISTS (
              SELECT 1 FROM cab_audience_rule_department _cab_rd
              WHERE _cab_rd.rule_id = _cab_r.id AND _cab_rd.department_id = ${worker.departmentId}
            )
          )
      )
    ) AS ok
  `) as Array<{ ok: boolean }>;
  return row?.ok === true;
}
