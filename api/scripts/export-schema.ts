import { printSchema } from "npm:graphql@16.10.0";
import { schema } from "../internal/schema.ts";

console.log(printSchema(schema));
