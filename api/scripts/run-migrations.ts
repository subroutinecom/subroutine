import { initializeDatabase } from "../db/index.ts";

await initializeDatabase();
Deno.exit(0);
