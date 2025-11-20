import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: [
    {
      ["http://localhost/graphql"]: {
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
