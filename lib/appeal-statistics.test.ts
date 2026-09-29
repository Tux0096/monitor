import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { averageMinutes, foldCategoricalRows, medianMinutes } from "./appeal-statistics.ts";

describe("medianMinutes", () => {
  it("возвращает null на пустом наборе", () => {
    assert.equal(medianMinutes([]), null);
  });

  it("берёт середину для нечётного количества", () => {
    assert.equal(medianMinutes([60, 120, 180]), 2);
  });

  it("усредняет две средние точки для чётного количества", () => {
    assert.equal(medianMinutes([60, 120, 180, 240]), 2.5);
  });

  it("не зависит от порядка входных значений", () => {
    assert.equal(medianMinutes([600, 60, 120]), medianMinutes([60, 120, 600]));
  });

  it("устойчива к одиночному выбросу, в отличие от среднего", () => {
    const values = [60, 60, 60, 60, 600_000];
    assert.equal(medianMinutes(values), 1);
    assert.ok((averageMinutes(values) ?? 0) > 1000);
  });
});

describe("foldCategoricalRows", () => {
  const rows = [
    { key: "a", label: "A", total: 10 },
    { key: "b", label: "B", total: 8 },
    { key: "c", label: "C", total: 5 },
    { key: "d", label: "D", total: 3 },
    { key: "e", label: "E", total: 1 },
  ];

  it("не трогает набор, который влезает в слоты", () => {
    const folded = foldCategoricalRows(rows, 5);
    assert.equal(folded.length, 5);
    assert.ok(folded.every((row) => !row.rest));
  });

  it("сортирует по убыванию", () => {
    const folded = foldCategoricalRows([...rows].reverse(), 5);
    assert.deepEqual(
      folded.map((row) => row.key),
      ["a", "b", "c", "d", "e"],
    );
  });

  it("сворачивает хвост в «Прочее» и сохраняет сумму", () => {
    const folded = foldCategoricalRows(rows, 3);
    assert.equal(folded.length, 3);
    assert.deepEqual(
      folded.map((row) => row.key),
      ["a", "b", "__rest__"],
    );
    assert.equal(folded[2].total, 5 + 3 + 1);
    assert.equal(folded[2].label, "Прочее (3)");
    assert.equal(
      folded.reduce((sum, row) => sum + row.total, 0),
      rows.reduce((sum, row) => sum + row.total, 0),
    );
  });

  it("возвращает пустой список при нулевом числе слотов", () => {
    assert.deepEqual(foldCategoricalRows(rows, 0), []);
  });
});
