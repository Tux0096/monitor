import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizePathGroup } from "./path-group.ts";

describe("группировка путей", () => {
  it("убирает хвостовой слэш", () => {
    assert.equal(normalizePathGroup("/samara/catalog/"), "/samara/catalog");
  });

  it("схлопывает числовые идентификаторы", () => {
    assert.equal(normalizePathGroup("/samara/product/12345"), "/samara/product/:id");
    assert.equal(normalizePathGroup("/order/1"), "/order/:id");
  });

  it("схлопывает хэши и uuid", () => {
    assert.equal(normalizePathGroup("/order/a1b2c3d4e5f6a7b8"), "/order/:id");
    assert.equal(
      normalizePathGroup("/x/550e8400-e29b-41d4-a716-446655440000"),
      "/x/:uuid",
    );
  });

  it("отбрасывает query и якорь — там бывают utm и персональные данные", () => {
    assert.equal(normalizePathGroup("/samara/cart?utm_source=x#top"), "/samara/cart");
  });

  it("нормализует корень и пустой путь", () => {
    assert.equal(normalizePathGroup(""), "/");
    assert.equal(normalizePathGroup("/"), "/");
  });

  it("добавляет ведущий слэш", () => {
    assert.equal(normalizePathGroup("personal"), "/personal");
  });

  it("режет слишком глубокие пути", () => {
    assert.equal(normalizePathGroup("/a/b/c/d/e/f/g"), "/a/b/c/d/e");
  });

  it("ограничивает длину сегмента — защита от мусора", () => {
    const long = "x".repeat(200);
    const result = normalizePathGroup(`/${long}`);
    assert.equal(result.length, 41); // "/" + 40 символов
  });

  it("не падает на мусоре", () => {
    assert.doesNotThrow(() => normalizePathGroup("////"));
    assert.doesNotThrow(() => normalizePathGroup("?????"));
  });
});
