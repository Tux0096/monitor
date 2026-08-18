import crypto from "node:crypto";

/**
 * Проверка подписи initData от Telegram Mini App.
 *
 * Это единственная граница доверия кабинета. Всё, что приходит с клиента,
 * подделывается — кроме подписи, которую может поставить только владелец
 * токена бота.
 *
 * `initDataUnsafe` не используется нигде и никогда: там те же поля,
 * но без подписи.
 */

export class InvalidInitData extends Error {
  // Поле объявлено явно, а не через parameter property: последнее
  // не поддерживается стриппингом типов в node --test.
  readonly reason: string;

  constructor(reason: string) {
    super(`invalid init data: ${reason}`);
    this.name = "InvalidInitData";
    this.reason = reason;
  }
}

export type InitDataUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export type VerifiedInitData = {
  raw: Record<string, string>;
  user: InitDataUser;
  authDate: number;
  startParam: string | null;
};

/**
 * @param initData сырая строка из `WebApp.initData`
 * @param botToken токен бота, которым подписан запрос
 * @param maxAgeSec допустимый возраст подписи; 60 секунд по умолчанию
 * @param now подменяемое время — нужно тестам
 */
export function verifyInitData(
  initData: string,
  botToken: string,
  maxAgeSec = 60,
  now: () => number = () => Date.now() / 1000,
): VerifiedInitData {
  if (!initData) throw new InvalidInitData("empty");
  if (!botToken) throw new InvalidInitData("no bot token configured");

  const params = new URLSearchParams(initData);
  const data: Record<string, string> = {};
  for (const [key, value] of params.entries()) data[key] = value;

  const received = data.hash;
  if (!received) throw new InvalidInitData("no hash");
  delete data.hash;

  // signature — подпись Ed25519 для сторонних приложений. В проверке
  // хеша не участвует; если её оставить, контрольная строка не сойдётся.
  delete data.signature;

  const checkString = Object.keys(data)
    .sort()
    .map((key) => `${key}=${data[key]}`)
    .join("\n");

  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = crypto.createHmac("sha256", secret).update(checkString).digest("hex");

  // Сравнение постоянного времени: обычное === утекает информацию
  // о том, сколько символов подписи угадано.
  const expectedBuf = Buffer.from(expected, "hex");
  const receivedBuf = Buffer.from(received, "hex");
  if (
    expectedBuf.length !== receivedBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, receivedBuf)
  ) {
    throw new InvalidInitData("bad signature");
  }

  const authDate = Number.parseInt(data.auth_date ?? "0", 10);
  if (!Number.isFinite(authDate) || authDate <= 0) {
    throw new InvalidInitData("no auth_date");
  }
  if (now() - authDate > maxAgeSec) {
    throw new InvalidInitData("expired");
  }

  let user: InitDataUser;
  try {
    user = JSON.parse(data.user ?? "") as InitDataUser;
  } catch {
    throw new InvalidInitData("no user");
  }
  if (!user || typeof user.id !== "number") throw new InvalidInitData("no user id");

  return {
    raw: data,
    user,
    authDate,
    startParam: data.start_param ?? null,
  };
}

/**
 * Подписывает initData тем же алгоритмом. Нужно тестам и локальной отладке,
 * в проде не вызывается.
 */
export function signInitDataForTest(
  fields: Record<string, string>,
  botToken: string,
): string {
  const checkString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = crypto.createHmac("sha256", secret).update(checkString).digest("hex");
  const params = new URLSearchParams({ ...fields, hash });
  return params.toString();
}
