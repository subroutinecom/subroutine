import { printSchema } from "graphql";
import { schema } from "../internal/schema.ts";

// deno-lint-ignore no-explicit-any
console.log("GraphQL Schema:", printSchema(schema as any));
