import { printSchema } from "graphql";
import { schema } from "../internal/schema.ts";

console.log("GraphQL Schema:", printSchema(schema));
