# GraphQL Schema Package

This package stores the generated GraphQL schema shared across services.

- `schema.graphql` is generated from the running API via `deno task graphql:schema` (GraphQL Code Generator introspection).
- PM2 in the API service watches source changes in development and reruns the task automatically.
- Other services (admin panel, tests, etc.) should read this file instead of keeping their own copies.
- Do not edit the schema file manually; update the API schema and regenerate instead.
