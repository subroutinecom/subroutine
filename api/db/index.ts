import { Kysely, Migrator, PostgresDialect } from "kysely";
import type { MigrationProvider } from "kysely";
import type { Database as DB } from "./schema";
import pg from "pg";
import * as migration001 from "../migrations/001_initial_schema";

const { Pool } = pg;

const DATABASE_URL =
  Deno.env.get("DATABASE_URL") ||
  "postgresql://subroutine:subroutine@localhost:5432/subroutine";

const dialect = new PostgresDialect({
  pool: new Pool({
    connectionString: DATABASE_URL,
    max: 10,
  }),
});

export const db = new Kysely<DB>({
  dialect,
});

const migrationProvider: MigrationProvider = {
  getMigrations: () =>
    Promise.resolve({
      "001_initial_schema": migration001,
    }),
};

export const initializeDatabase = async () => {
  try {
    console.log("Running database migrations...");

    const migrator = new Migrator({
      db,
      provider: migrationProvider,
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
