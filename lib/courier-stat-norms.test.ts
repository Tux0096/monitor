import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  APPEAL_NORM_RATIO,
  calcActualRatioPercent,
  calcDeviation,
  calcNormAppeals,
  endOfIsoWeek,
  formatIsoWeekLabel,
  isWithinNorm,
  startOfIsoWeek,
  toDateString,
} from "./courier-stat-norms.ts";

describe("норма обращений", () => {
  it("считает 0.02 % от заказов", () => {
    assert.equal(APPEAL_NORM_RATIO, 0.0002);
    assert.equal(calcNormAppeals(10_000), 2);
    assert.equal(calcNormAppeals(50_000), 10);
    assert.equal(calcNormAppeals(100_000), 20);
  });

  it("округляет вниз, не давая бесплатного запаса", () => {
    // 4000 × 0.0002 = 0.8 → 0, а не 1
    assert.equal(calcNormAppeals(4_000), 0);
    // 14 999 × 0.0002 = 2.9998 → 2
    assert.equal(calcNormAppeals(14_999), 2);
  });

  it("не падает на нуле и мусоре", () => {
    assert.equal(calcNormAppeals(0), 0);
    assert.equal(calcNormAppeals(-100), 0);
    assert.equal(calcNormAppeals(Number.NaN), 0);
    assert.equal(calcNormAppeals(Number.POSITIVE_INFINITY), 0);
  });
});

describe("отклонение от нормы", () => {
  it("отрицательное или нулевое = в норме", () => {
    assert.equal(calcDeviation(2, 2), 0);
    assert.ok(isWithinNorm(2, 2));

    assert.equal(calcDeviation(1, 2), -1);
    assert.ok(isWithinNorm(1, 2));
  });

  it("положительное = превышение", () => {
    assert.equal(calcDeviation(5, 2), 3);
    assert.equal(isWithinNorm(5, 2), false);
  });

  it("нулевая норма при нулевых обращениях всё ещё в норме", () => {
    assert.ok(isWithinNorm(0, 0));
    assert.equal(isWithinNorm(1, 0), false);
  });
});

describe("фактическая доля", () => {
  it("возвращает проценты", () => {
    assert.equal(calcActualRatioPercent(2, 10_000), 0.02);
    assert.equal(calcActualRatioPercent(20, 10_000), 0.2);
  });

  it("возвращает null без заказов — делить не на что", () => {
    assert.equal(calcActualRatioPercent(5, 0), null);
    assert.equal(calcActualRatioPercent(5, -1), null);
  });
});

describe("границы ISO-недели", () => {
  it("среда попадает в неделю со своим понедельником", () => {
    // 2026-08-05 — среда
    const start = startOfIsoWeek(new Date("2026-08-05T12:00:00Z"));
    assert.equal(toDateString(start), "2026-08-03"); // понедельник
    assert.equal(toDateString(endOfIsoWeek(start)), "2026-08-09"); // воскресенье
  });

  it("воскресенье относится к уходящей неделе, а не к следующей", () => {
    // 2026-08-09 — воскресенье, должно дать понедельник 2026-08-03
    const start = startOfIsoWeek(new Date("2026-08-09T23:59:00Z"));
    assert.equal(toDateString(start), "2026-08-03");
  });

  it("понедельник — сам себе начало недели", () => {
    const start = startOfIsoWeek(new Date("2026-08-03T00:00:00Z"));
    assert.equal(toDateString(start), "2026-08-03");
  });

  it("неделя всегда длиной 7 дней", () => {
    for (const day of ["2026-01-01", "2026-06-15", "2026-12-31"]) {
      const start = startOfIsoWeek(new Date(`${day}T00:00:00Z`));
      const end = endOfIsoWeek(start);
      const days = (end.getTime() - start.getTime()) / 86_400_000 + 1;
      assert.equal(days, 7, `неделя для ${day}`);
    }
  });
});

describe("метка недели", () => {
  it("формат ISO год-неделя", () => {
    const start = startOfIsoWeek(new Date("2026-08-05T00:00:00Z"));
    assert.match(formatIsoWeekLabel(start), /^\d{4}-W\d{2}$/);
  });

  it("неделя на стыке годов относится к году своего четверга", () => {
    // 2026-12-31 — четверг, значит неделя ещё 2026 года
    const start = startOfIsoWeek(new Date("2026-12-31T00:00:00Z"));
    assert.ok(formatIsoWeekLabel(start).startsWith("2026-"));
  });

  it("уникальна для соседних недель", () => {
    const a = formatIsoWeekLabel(startOfIsoWeek(new Date("2026-08-05T00:00:00Z")));
    const b = formatIsoWeekLabel(startOfIsoWeek(new Date("2026-08-12T00:00:00Z")));
    assert.notEqual(a, b);
  });
});
