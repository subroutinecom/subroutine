# Integration Provider Registry

Each integration provider is defined once inside this directory so the API,
sandbox, and admin panel all share the same defaults. To add a provider:

1. Create a file under `definitions/` that exports an `IntegrationDefinition`
   describing the provider (name, auth strategy, scopes, etc.).
2. Add the definition to the registry in `../providers.ts`. The union type
   `IntegrationProvider` is derived from the registered ids automatically.
3. If the provider needs sandbox-specific behaviour, extend the switch in
   `sandbox/integrationProxyWorker.ts`.

When adding an OAuth2 provider, ensure you set:

- `authUrl` / `tokenUrl`
- `defaultScopes` plus any `requiredScopes`
- `viewerScoped` if the provider needs per-viewer credentials (e.g. Gmail).

This registry is intentionally data-driven so future auth strategies (generic
OAuth, API keys, custom flows) can be introduced by adding new definitions and
strategy handlers without scattering constants throughout the codebase.
