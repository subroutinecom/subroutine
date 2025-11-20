# Agent Instructions

- All TypeScript projects must be written in type-safe TS, and in strict mode. Don't add any usage of `any` or cast types over.
- The runtime of choice for all projects using Typescript is Deno. Never use NodeJS directly.
- When using Deno, we use --sloppy-imports. You Must Not add extensions (.ts) to file imports.
- npm dependencies are managed via pnpm workspaces. Use `pnpm add <dep> --filter @subroutine/<project>` (or `pnpm install` for bootstrap). Deno must stay the runtime.
- Each Deno project keeps its TypeScript/task config in `deno.json`, but dependencies resolve from the shared `node_modules` hydrated by pnpm (`nodeModulesDir` is set to `manual`).

Configuration:

- **Environment variables (.env)** must ONLY be used for secrets (API keys, client secrets, database passwords, etc.)
- **Standard configuration values** (URLs, feature flags, CORS origins, etc.) must be driven via `config.yaml`
- Never add configuration to environment variables if it can go in config.yaml

Typescript Conventions:

- Prefer `const fun = async () => {}` over `async fun() {}`
- Prefer simple functions with options/config parameters over classes.

Database Conventions:

- **Column naming**: Always use camelCase for database column names (e.g., `organizationId`, `createdAt`), NOT snake_case.

Interactions:

- Services can be started once and do not need to be restarted. They are set up to watch the source code and internally restart when the code changes.

Feedback Loop:

- After implementing any feature, create tests inside ./tests and validate: `deno task test`
- Validate type checking: `deno task check`
- Validate lint: `deno task eslint` or `deno lint`

Dont's

- Deno workers run with specific, stripped down set of permissions. You may not change that yourself. If the change to permission of sandbox is required. Ask the user and explain the reasoning.

Admin Panel Routing:

- Use directory-based route structure with remix-flat-routes, not dot notation.
- Layout files are `_layout.tsx`, index files are `_index.tsx`.
- Example: `routes/_authRequired+/_layout.tsx` instead of `routes/_authRequired.layout.tsx`.
- Folder names use suffix notation: `_authRequired+/` not `+_authRequired/`.

Admin Panel UI:

- **Icons**: Use `lucide-react` for all UI icons. Never create inline SVGs.
- **Social/brand icons**: Download to `public/icons/` and serve locally. Never hotlink external CDNs.
- **Components**: All reusable UI patterns must be extracted to `app/components/ui/` as DaisyUI-based components.
- **Styling**: Use DaisyUI components exclusively. No custom one-off styling in routes.
- **Context providers**: Must be in `root.tsx` to wrap all routes (including login).

Admin Panel GraphQL:

- **ALWAYS use `gql` tag** from `graphql-request`. Never use template strings.
- **Unique operation names** globally (e.g., `GetIntegration`, `ToggleIntegrationEnabled`).
- **Use generated types** from `~/__generated__/graphql` (auto-generated on file changes).
- **Client usage**: `graphqlClient.request<TypeName>(QUERY, variables)` from `~/lib/graphql-client`.

Admin Panel Forms:

- **Use `react-hook-form`** for all form handling. Never use manual useState for form fields.
- **Form state**: Use `useForm()` hook with TypeScript types for form data.
- **Field registration**: Use `register()` for inputs, `control` with `Controller` for custom components.
- **Validation**: Define validation rules inline with `register()` or use schema validation (zod/yup).
- **Error display**: Access field errors via `formState.errors.fieldName?.message`.
- **Submission**: Use `handleSubmit(onValid, onInvalid)` wrapper for form submission.
- **No manual onChange**: Let react-hook-form manage field state automatically.
