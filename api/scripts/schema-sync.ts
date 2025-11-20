import { printSchema } from "graphql";
import { schema } from "../internal/schema.ts";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(fileURLToPath(new URL("../", import.meta.url)));
const targets = [
  path.join(ROOT, "tests", "schema.graphql"),
  path.join(ROOT, "admin-panel", "schema.graphql"),
];

const writeSchema = async () => {
  const printed = printSchema(schema as never);
  for (const target of targets) {
    await Deno.mkdir(path.dirname(target), { recursive: true });
    await Deno.writeTextFile(target, printed);
    console.log(`GraphQL schema synced to ${target}`);
  }
};

await writeSchema();
