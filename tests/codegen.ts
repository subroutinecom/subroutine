import type { CodegenConfig } from "npm:@graphql-codegen/cli@6.0.2";

const config: CodegenConfig = {
  schema: "schema.graphql",
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
