import { calendarDefinition } from "./providers/definitions/calendar.ts";
import { githubDefinition } from "./providers/definitions/github.ts";
import { gmailDefinition } from "./providers/definitions/gmail.ts";
import { graphqlDefinition } from "./providers/definitions/graphql.ts";
import { linearDefinition } from "./providers/definitions/linear.ts";
import { mcpDefinition } from "./providers/definitions/mcp.ts";
import { mockOAuthDefinition } from "./providers/definitions/mock_oauth.ts";
import { openapiDefinition } from "./providers/definitions/openapi.ts";
import { slackDefinition } from "./providers/definitions/slack.ts";
import type { IntegrationDefinition } from "./providers/types.ts";

const definitions = [
  // First-party integrations (pre-configured for specific services)
  linearDefinition,
  slackDefinition,
  // Existing OAuth providers
  gmailDefinition,
  calendarDefinition,
  githubDefinition,
  // Generic protocol providers
  mcpDefinition,
  graphqlDefinition,
  openapiDefinition,
  // Test providers
  mockOAuthDefinition,
] as const;

export type IntegrationProvider = (typeof definitions)[number]["id"];
export const INTEGRATION_PROVIDERS: ReadonlyArray<IntegrationProvider> = definitions.map(
  (definition) => definition.id
);

const definitionMap = new Map(
  definitions.map((definition) => [definition.id, definition] as const)
);

export const isValidProvider = (value: string): value is IntegrationProvider =>
  definitionMap.has(value as IntegrationProvider);

export const getProviderDefinition = (provider: IntegrationProvider): IntegrationDefinition => {
  const definition = definitionMap.get(provider);
  if (!definition) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  return definition;
};

export const getAllProviderDefinitions = (): IntegrationDefinition[] => [...definitions];

export type {
  IntegrationDefinition,
  AuthStrategyDefinition,
  OAuthHandlers,
  OAuthTokenResponse,
  McpTransport,
  SandboxGraphQLConfig,
  SandboxMcpConfig,
  SandboxOpenAPIConfig,
  AuthStrategy,
  AuthBlock,
  OAuthConfig,
} from "./providers/types.ts";
