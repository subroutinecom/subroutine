# Tests

This directory contains integration tests for the Subroutine API.

## GraphQL Code Generation

GraphQL operation types are automatically generated using `graphql-codegen` from queries colocated in test files.

### Setup

All dependencies are already installed via `deno install`. The configuration is in `codegen.ts`.

### Usage

To regenerate GraphQL types after modifying operations or schema:

```bash
deno task codegen
```

This will:

1. Read the GraphQL schema from `schema.graphql`
2. Parse all GraphQL operations in test files (`**/*.test.ts`)
3. Generate TypeScript types in `generated/graphql.ts`

### Writing Tests with GraphQL

Colocate your GraphQL queries directly in test files using the `gql` tag from `graphql-request`:

```typescript
import { gql } from "graphql-request";
import type { CreateApiKeyMutation } from "../generated/graphql.ts";

const CREATE_API_KEY = gql`
  mutation CreateApiKey($name: String) {
    createApiKey(name: $name) {
      id
      name
      key
    }
  }
`;

const response = await gqlClient.request<CreateApiKeyMutation>(CREATE_API_KEY, {
  name: "My API Key",
});
```

## Run tests

```bash
docker compose up tests
```
