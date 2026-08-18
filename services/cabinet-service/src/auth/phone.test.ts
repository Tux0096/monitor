import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizePhone, phonesMatch } from "./phone.ts";

describe("нормализация телефона", () => {
  it("приводит российские формы к одному виду", () => {
    const expected = "79991234567";
    for (const input of [
      "+7 (999) 123-45-67",
      "89991234567",
      "8 999 123 45 67",
      "7-999-123-45-67",
      "+79991234567",
      "9991234567",
    ]) {
      assert.equal(normalizePhone(input), expected, `не сошлось на ${input}`);
    }
  });

  it("возвращает null на пустом", () => {
    assert.equal(normalizePhone(null), null);
    assert.equal(normalizePhone(undefined), null);
    assert.equal(normalizePhone(""), null);
    assert.equal(normalizePhone("   "), null);
    assert.equal(normalizePhone("абв"), null);
  });

  it("не портит зарубежные номера приведением к 7", () => {
    // 12 цифр — не российский формат, оставляем как есть
    assert.equal(normalizePhone("+380 50 123 4567"), "380501234567");
  });

  it("сравнение работает поверх разных записей", () => {
    assert.ok(phonesMatch("+7 (999) 123-45-67", "89991234567"));
    assert.ok(phonesMatch("9991234567", "+79991234567"));
    assert.equal(phonesMatch("89991234567", "89991234568"), false);
  });

  it("пустое не совпадает ни с чем, включая пустое", () => {
    assert.equal(phonesMatch(null, null), false);
    assert.equal(phonesMatch("", "89991234567"), false);
  });
});
