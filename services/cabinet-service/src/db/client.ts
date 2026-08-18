import postgres from "postgres";

/**
 * Своя база кабинета — та же monitor_core, таблицы с префиксом cab_.
 *
 * Клиент создаётся при импорте, а не лениво: ленивый Proxy не работает
 * как tagged template, потому что цель прокси обязана быть функцией.
 */
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

export const sql = postgres(url, { max: 10 });
