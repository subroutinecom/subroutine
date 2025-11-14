# Agent Instructions

- All TypeScript projects must be written in type-safe TS, and in strict mode. Don't add any usage of `any` or cast types over.
- The runtime of choice for all projects using Typescript is Deno. Never use NodeJS directly.
- When using Deno, we use --sloppy-imports. You Must Not add extensions (.ts) to file imports.
- When adding new dependencies, only do so by calling `deno install <dep>` without specifying a version.

Configuration:

- **Environment variables (.env)** must ONLY be used for secrets (API keys, client secrets, database passwords, etc.)
- **Standard configuration values** (URLs, feature flags, CORS origins, etc.) must be driven via `config.yaml`
- Never add configuration to environment variables if it can go in config.yaml

Typescript Conventions:

- Prefer `const fun = async () => {}` over `async fun() {}`
- Prefer simple functions with options/config parameters over classes.

Interactions:

- Use docker-compose to interact with services - start, stop, build and test them through docker-compose.
- All integration tests run inside the docker-compose stack (tests service depends on the others), so bring the test container up via docker-compose whenever you need to validate changes.
- Services can be started once and do not need to be restarted. They are set up to watch the source code and internally restart when the code changes.

Feedback Loop:

- After implementing any feature, create the tests inside ./tests and validate that they are passing.
- Validate type checking by running: deno task check in repository root.
- Validate lint by running in the root:
  - deno task eslint
  - deno lint

Dont's

- Deno workers run with specific, stripped down set of permissions. You may not change that yourself. If the change to permission of sandbox is required. Ask the user and explain the reasoning.

Admin Panel Routing:

- Use directory-based route structure with remix-flat-routes, not dot notation.
- Layout files are `_layout.tsx`, index files are `_index.tsx`.
- Example: `routes/_authRequired+/_layout.tsx` instead of `routes/_authRequired.layout.tsx`.
- Folder names use suffix notation: `_authRequired+/` not `+_authRequired/`.

Admin Panel UI:

- **Icons**: Use `@tabler/icons-react` for all UI icons. Never create inline SVGs.
- **Social/brand icons**: Download to `public/icons/` and serve locally. Never hotlink external CDNs.
- **Components**: All reusable UI patterns must be extracted to `app/components/ui/` as DaisyUI-based components.
- **Styling**: Use DaisyUI components exclusively. No custom one-off styling in routes.
- **Context providers**: Must be in `root.tsx` to wrap all routes (including login).
