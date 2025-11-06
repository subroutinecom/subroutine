# Agent Instructions

- All TypeScript projects must be written in type-safe TS, and in strict mode. Don't add any usage of `any` or cast types over.
- The runtime of choice for all projects using Typescript is Deno. Never use NodeJS directly.
- When using Deno, we use --sloppy-imports. You Must Not add extensions (.ts) to file imports.

Interactions:

- Use docker-compose to interact with services - start, stop, build and test them through docker-compose.
- Services can be started once and do not need to be restarted. They are set up to watch the source code and internally restart when the code changes.

Feedback Loop:

- After implementing any feature, create the tests inside ./tests and validate that they are passing.
- Inside the service directory you must run typecheck and lint:
  - deno check
  - deno lint

Dont's

- Deno workers run with specific, stripped down set of permissions. You may not change that yourself. If the change to permission of sandbox is required. Ask the user and explain the reasoning.
