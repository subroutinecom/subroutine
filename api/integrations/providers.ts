import { githubDefinition } from "./providers/definitions/github.ts";
import { gmailDefinition } from "./providers/definitions/gmail.ts";
import { mockOAuthDefinition } from "./providers/definitions/mock_oauth.ts";
import type { IntegrationDefinition } from "./providers/types.ts";

const definitions = [
  gmailDefinition,
  githubDefinition,
  mockOAuthDefinition,
] as const;

export type IntegrationProvider = (typeof definitions)[number]["id"];
export const INTEGRATION_PROVIDERS: ReadonlyArray<IntegrationProvider> = definitions.map(
  (definition) => definition.id,
);

const definitionMap = new Map(
  definitions.map((definition) => [definition.id, definition] as const),
);

export const isValidProvider = (value: string): value is IntegrationProvider =>
  definitionMap.has(value as IntegrationProvider);

export const getProviderDefinition = (
  provider: IntegrationProvider,
): IntegrationDefinition => {
  const definition = definitionMap.get(provider);
  if (!definition) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  return definition;
};

export const getAllProviderDefinitions = (): IntegrationDefinition[] => [...definitions];

export type { IntegrationDefinition, AuthStrategyDefinition } from "./providers/types.ts";
