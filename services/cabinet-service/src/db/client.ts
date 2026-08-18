import postgres from "postgres";

import { getConfig } from "../config.js";

let client: postgres.Sql | null = null;

/** Своя база кабинета — та же monitor_core, таблицы с префиксом cab_. */
export const sql: postgres.Sql = new Proxy({} as postgres.Sql, {
  get(_target, prop) {
    client ??= postgres(getConfig().databaseUrl, { max: 10 });
    const value = Reflect.get(client, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
  apply(_target, _thisArg, args) {
    client ??= postgres(getConfig().databaseUrl, { max: 10 });
    return (client as unknown as (...a: unknown[]) => unknown)(...args);
  },
}) as postgres.Sql;
