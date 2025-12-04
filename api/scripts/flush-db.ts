#!/usr/bin/env -S deno run --allow-read --allow-env --allow-net

import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { getLogger } from "../utils/logger.ts";
const logger = getLogger("scripts.flush-db");


const { Pool } = pg;

const DATABASE_URL =
  Deno.env.get("DATABASE_URL") || "postgresql://subroutine:subroutine@localhost:5432/subroutine";

// Show warning and get confirmation
logger.info("\nWARNING: DATABASE FLUSH\n");
logger.info("This will:");
logger.info("  • Drop ALL tables");
logger.info("  • Delete ALL data");
logger.info("  • Reset the database to empty state");
logger.info(`\nTarget database: ${DATABASE_URL}\n`);

const confirmation = prompt("Type 'FLUSH' to confirm:");

if (confirmation !== "FLUSH") {
  logger.info("\nFlush cancelled - confirmation did not match");
  Deno.exit(0);
}

logger.info("\nFlushing database...\n");

const db = new Kysely({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: DATABASE_URL,
      max: 1,
    }),
  }),
});

try {
  const result = await sql<{ tablename: string }>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  `.execute(db);

  if (result.rows.length === 0) {
    logger.info("Database is already empty");
  } else {
    logger.info(`Found ${result.rows.length} tables to drop:\n`);

    for (const row of result.rows) {
      logger.info(`Dropping table: ${row.tablename}`);
      await sql`DROP TABLE IF EXISTS ${sql.table(row.tablename)} CASCADE`.execute(db);
    }

    logger.info(`\nSuccessfully dropped ${result.rows.length} tables`);
  }

  // Also drop the kysely migration table if it exists
  await sql`DROP TABLE IF EXISTS kysely_migration CASCADE`.execute(db);
  logger.info("Dropped migration tracking table");

  logger.info("\n🎉 Database flush complete!\n");
  logger.info("Run migrations to set up schema:");
  logger.info("deno task migrate (or however you run migrations)\n");
} catch (error) {
  logger.error("\nError flushing database:", error);
  Deno.exit(1);
} finally {
  await db.destroy();
}
