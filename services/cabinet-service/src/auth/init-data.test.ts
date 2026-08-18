import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { InvalidInitData, signInitDataForTest, verifyInitData } from "./init-data.ts";

const BOT = "123456:AAEtestTokenForUnitTests";
const OTHER_BOT = "999999:BBdifferentTokenEntirely";

function fields(authDate: number, extra: Record<string, string> = {}) {
  return {
    auth_date: String(authDate),
    query_id: "AAF_test",
    user: JSON.stringify({ id: 42, first_name: "Иван", username: "ivan" }),
    ...extra,
  };
}

describe("проверка initData", () => {
  const nowSec = 1_800_000_000;
  const now = () => nowSec;

  it("принимает валидную подпись", () => {
    const initData = signInitDataForTest(fields(nowSec), BOT);
    const result = verifyInitData(initData, BOT, 60, now);
    assert.equal(result.user.id, 42);
    assert.equal(result.authDate, nowSec);
  });

  it("отклоняет подделанную подпись", () => {
    const initData = signInitDataForTest(fields(nowSec), BOT).replace(
      /hash=[0-9a-f]+/,
      "hash=" + "0".repeat(64),
    );
    assert.throws(() => verifyInitData(initData, BOT, 60, now), InvalidInitData);
  });

  it("отклоняет подпись другого бота — иначе чужой бот войдёт под нашим сотрудником", () => {
    const initData = signInitDataForTest(fields(nowSec), OTHER_BOT);
    assert.throws(() => verifyInitData(initData, BOT, 60, now), /bad signature/);
  });

  it("принимает подпись возрастом 59 секунд", () => {
    const initData = signInitDataForTest(fields(nowSec - 59), BOT);
    assert.doesNotThrow(() => verifyInitData(initData, BOT, 60, now));
  });

  it("отклоняет просроченную на 61 секунду", () => {
    const initData = signInitDataForTest(fields(nowSec - 61), BOT);
    assert.throws(() => verifyInitData(initData, BOT, 60, now), /expired/);
  });

  it("отклоняет без hash", () => {
    const initData = "auth_date=1&user=%7B%22id%22%3A1%7D";
    assert.throws(() => verifyInitData(initData, BOT, 60, now), /no hash/);
  });

  it("игнорирует поле signature — оно не входит в контрольную строку", () => {
    // signature добавляется после подписания: если бы она участвовала
    // в проверке, хеш бы не сошёлся.
    const base = signInitDataForTest(fields(nowSec), BOT);
    const withSignature = `${base}&signature=abc123def456`;
    const result = verifyInitData(withSignature, BOT, 60, now);
    assert.equal(result.user.id, 42);
  });

  it("отклоняет без auth_date", () => {
    const raw = { user: JSON.stringify({ id: 1 }) };
    const initData = signInitDataForTest(raw, BOT);
    assert.throws(() => verifyInitData(initData, BOT, 60, now), /no auth_date/);
  });

  it("отклоняет без user", () => {
    const initData = signInitDataForTest({ auth_date: String(nowSec) }, BOT);
    assert.throws(() => verifyInitData(initData, BOT, 60, now), /no user/);
  });

  it("отклоняет пустую строку и пустой токен", () => {
    assert.throws(() => verifyInitData("", BOT, 60, now), /empty/);
    const initData = signInitDataForTest(fields(nowSec), BOT);
    assert.throws(() => verifyInitData(initData, "", 60, now), /no bot token/);
  });

  it("разбирает start_param для deep-link", () => {
    const initData = signInitDataForTest(fields(nowSec, { start_param: "news_42" }), BOT);
    assert.equal(verifyInitData(initData, BOT, 60, now).startParam, "news_42");
  });
});
