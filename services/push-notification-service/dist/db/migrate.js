import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema.js";
const url = process.env.DATABASE_URL;
if (!url)
    throw new Error("DATABASE_URL is required");
const migrationClient = postgres(url, { max: 1 });
const db = drizzle(migrationClient, { schema });
await migrate(db, { migrationsFolder: "./drizzle" });
await migrationClient.end();
console.log("Push notification migrations applied");
