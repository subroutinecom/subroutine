import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "../tests/schema.graphql",
  documents: ["app/**/*.tsx", "app/**/*.ts", "!app/__generated__/**"],
  generates: {
    "./app/__generated__/graphql.ts": {
      plugins: [
        "@graphql-codegen/typescript",
        "@graphql-codegen/typescript-operations",
        "@graphql-codegen/typed-document-node",
      ],
      config: {
        strictScalars: true,
        scalars: {
          DateTime: "string",
        },
      },
    },
  },
  watch: true,
  ignoreNoDocuments: true,
};

export default config;
