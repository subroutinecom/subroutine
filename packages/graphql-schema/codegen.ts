import type { CodegenConfig } from "@graphql-codegen/cli";

const defaultEndpoint = "http://localhost:3002/graphql";
const endpoint = Deno.env.get("GRAPHQL_SCHEMA_ENDPOINT") ?? defaultEndpoint;

const config: CodegenConfig = {
  schema: [
    {
      [endpoint]: {
        headers: {
          "x-graphql-introspection": "1",
        },
      },
    },
  ],
  documents: [],
  generates: {
    "./schema.graphql": {
      plugins: ["schema-ast"],
      config: {
        includeDirectives: true,
      },
    },
  },
  ignoreNoDocuments: true,
};

export default config;
