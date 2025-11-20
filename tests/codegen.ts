import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "../packages/graphql-schema/schema.graphql",
  documents: ["tests/**/*.test.ts", "**/*.test.ts"],
  generates: {
    "./generated/graphql.ts": {
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
};

export default config;
