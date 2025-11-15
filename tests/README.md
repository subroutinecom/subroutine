# Tests

This directory contains integration tests for the Subroutine API.

## GraphQL Code Generation

GraphQL operation types are automatically generated using `graphql-codegen`.

### Setup

All dependencies are already installed via `deno install`. The configuration is in `codegen.ts`.

### Usage

To regenerate GraphQL types after modifying operations or schema:

```bash
deno task codegen
```

This will:
1. Read the GraphQL schema from `schema.graphql`
2. Parse all GraphQL operations in `graphql/**/*.graphql`
3. Generate TypeScript types in `generated/graphql.ts`

### Adding New Operations

1. Add your GraphQL query/mutation to `graphql/apikeys.graphql` (or create a new `.graphql` file)
2. Run `deno task codegen` to generate types
3. Import the generated types and documents from `utils/graphql-operations.ts`

Example:
```typescript
import {
  CreateApiKeyDocument,
  type CreateApiKeyMutation,
  type CreateApiKeyMutationVariables
} from "../utils/graphql-operations";

const response = await gqlClient.request<CreateApiKeyMutation>(
  CreateApiKeyDocument,
  { name: "My API Key" }
);
```

### Schema Updates

When the API schema changes:

1. Re-export the schema:
   ```bash
   cd /home/workspace/subroutine/api
   deno run --allow-read --allow-env --allow-net --allow-ffi --sloppy-imports \
     scripts/export-schema.ts > /home/workspace/subroutine/tests/schema.graphql
   ```

2. Regenerate types:
   ```bash
   cd /home/workspace/subroutine/tests
   deno task codegen
   ```

## Running Tests

```bash
deno task test
```

Or run via docker-compose:

```bash
docker compose up tests
```
