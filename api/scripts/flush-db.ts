#!/usr/bin/env -S deno run --allow-read --allow-env --allow-net

import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";

const { Pool } = pg;

const DATABASE_URL =
  Deno.env.get("DATABASE_URL") || "postgresql://subroutine:subroutine@localhost:5432/subroutine";

// Show warning and get confirmation
console.log("\nWARNING: DATABASE FLUSH\n");
console.log("This will:");
console.log("  • Drop ALL tables");
console.log("  • Delete ALL data");
console.log("  • Reset the database to empty state");
console.log(`\nTarget database: ${DATABASE_URL}\n`);

const confirmation = prompt("Type 'FLUSH' to confirm:");

if (confirmation !== "FLUSH") {
  console.log("\nFlush cancelled - confirmation did not match");
  Deno.exit(0);
}

console.log("\nFlushing database...\n");

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
    console.log("Database is already empty");
  } else {
    console.log(`Found ${result.rows.length} tables to drop:\n`);

    for (const row of result.rows) {
      console.log(`Dropping table: ${row.tablename}`);
      await sql`DROP TABLE IF EXISTS ${sql.table(row.tablename)} CASCADE`.execute(db);
    }

    console.log(`\nSuccessfully dropped ${result.rows.length} tables`);
  }

  // Also drop the kysely migration table if it exists
  await sql`DROP TABLE IF EXISTS kysely_migration CASCADE`.execute(db);
  console.log("Dropped migration tracking table");

  console.log("\n🎉 Database flush complete!\n");
  console.log("Run migrations to set up schema:");
  console.log("deno task migrate (or however you run migrations)\n");
} catch (error) {
  console.error("\nError flushing database:", error);
  Deno.exit(1);
} finally {
  await db.destroy();
}
