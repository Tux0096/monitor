import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isVisible, type Audience } from "./audience.ts";

const manager = { postId: 10, departmentId: 100 }; // управляющий, Самара
const courier = { postId: 20, departmentId: 100 }; // курьер, Самара
const managerTlt = { postId: 10, departmentId: 200 }; // управляющий, Тольятти

describe("модель доступа", () => {
  it("is_everyone видно всем", () => {
    const a: Audience = { isEveryone: true, rules: [] };
    for (const w of [manager, courier, managerTlt]) assert.ok(isVisible(a, w));
  });

  it("только должности — любое предприятие", () => {
    const a: Audience = { isEveryone: false, rules: [{ postIds: [10], departmentIds: [] }] };
    assert.ok(isVisible(a, manager));
    assert.ok(isVisible(a, managerTlt));
    assert.equal(isVisible(a, courier), false);
  });

  it("только предприятия — любая должность", () => {
    const a: Audience = { isEveryone: false, rules: [{ postIds: [], departmentIds: [100] }] };
    assert.ok(isVisible(a, manager));
    assert.ok(isVisible(a, courier));
    assert.equal(isVisible(a, managerTlt), false);
  });

  it("внутри правила И — «управляющие в Самаре»", () => {
    const a: Audience = {
      isEveryone: false,
      rules: [{ postIds: [10], departmentIds: [100] }],
    };
    assert.ok(isVisible(a, manager));
    assert.equal(isVisible(a, courier), false, "курьер в Самаре не подходит по должности");
    assert.equal(isVisible(a, managerTlt), false, "управляющий в Тольятти не подходит по точке");
  });

  it("между правилами ИЛИ — «все управляющие + все в Самаре»", () => {
    const a: Audience = {
      isEveryone: false,
      rules: [
        { postIds: [10], departmentIds: [] },
        { postIds: [], departmentIds: [100] },
      ],
    };
    assert.ok(isVisible(a, manager));
    assert.ok(isVisible(a, courier), "попадает по второму правилу");
    assert.ok(isVisible(a, managerTlt), "попадает по первому правилу");
  });

  it("пустая аудитория не видна никому — черновик не утекает", () => {
    const a: Audience = { isEveryone: false, rules: [] };
    for (const w of [manager, courier, managerTlt]) assert.equal(isVisible(a, w), false);
  });

  it("правило с пустыми списками видно всем с заполненным профилем", () => {
    const a: Audience = { isEveryone: false, rules: [{ postIds: [], departmentIds: [] }] };
    assert.ok(isVisible(a, manager));
  });

  it("сотрудник без должности и точки не проходит адресные правила", () => {
    const nobody = { postId: null, departmentId: null };
    assert.equal(
      isVisible({ isEveryone: false, rules: [{ postIds: [10], departmentIds: [] }] }, nobody),
      false,
    );
    assert.ok(
      isVisible({ isEveryone: true, rules: [] }, nobody),
      "но общее объявление видит",
    );
  });
});
