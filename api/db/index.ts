import { Kysely, Migrator, PostgresDialect } from "kysely";
import pg from "pg";
import { migrations } from "./migrations-index.ts";
import type { Database as DB } from "./schema.ts";

const { Pool } = pg;

const DATABASE_URL =
  Deno.env.get("DATABASE_URL") || "postgresql://subroutine:subroutine@localhost:5432/subroutine";

const dialect = new PostgresDialect({
  pool: new Pool({
    connectionString: DATABASE_URL,
    max: 10,
  }),
});

export const db = new Kysely<DB>({
  dialect,
});

export const initializeDatabase = async () => {
  try {
    console.log("Running database migrations...");

    const migrator = new Migrator({
      db,
      provider: {
        async getMigrations() {
          const keys = Object.keys(migrations);
          const values = await Promise.all(Object.values(migrations));
          return keys.reduce(
            (acc, key, index) => {
              acc[key] = values[index];
              return acc;
            },
            {} as Record<string, any>
          );
        },
      },
    });

    const { error, results } = await migrator.migrateToLatest();

    results?.forEach((result) => {
      if (result.status === "Success") {
        console.log(`Migration "${result.migrationName}" executed successfully`);
      } else if (result.status === "Error") {
        console.error(`Migration "${result.migrationName}" failed`);
      }
    });

    if (error) {
      console.error("Failed to run migrations:", error);
      throw error;
    }

    console.log("Database initialized successfully");
  } catch (error) {
    console.error("Failed to initialize database:", error);
    throw error;
  }
};
