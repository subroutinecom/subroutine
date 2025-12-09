import { parse } from "yaml";
import { z } from "zod";
import { getLogger } from "../utils/logger.ts";

const logger = getLogger("api/services/first-party-credentials.ts");

/**
 * Schema for OAuth credentials per provider
 */
const oauthCredentialsSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});

/**
 * Schema for the first-party credentials file
 */
const firstPartyCredentialsSchema = z.record(z.string(), oauthCredentialsSchema);

export type OAuthCredentials = z.infer<typeof oauthCredentialsSchema>;
export type FirstPartyCredentials = z.infer<typeof firstPartyCredentialsSchema>;

let cachedCredentials: FirstPartyCredentials | null = null;

/**
 * Find the secrets file path
 */
const findSecretsPath = (): string | null => {
  const envPath = Deno.env.get("FIRST_PARTY_SECRETS_PATH");
  if (envPath) return envPath;

  const candidates = [
    "/app/secrets/first-party-oauth.yaml",
    "./secrets/first-party-oauth.yaml",
    "../secrets/first-party-oauth.yaml",
    "/secrets/first-party-oauth.yaml",
  ];

  for (const path of candidates) {
    try {
      Deno.statSync(path);
      return path;
    } catch {
      continue;
    }
  }

  return null;
};

/**
 * Load first-party OAuth credentials from YAML file
 */
export const loadFirstPartyCredentials = async (): Promise<FirstPartyCredentials> => {
  if (cachedCredentials) return cachedCredentials;

  const secretsPath = findSecretsPath();
  if (!secretsPath) {
    logger.debug("No first-party-oauth.yaml found, first-party credentials disabled");
    cachedCredentials = {};
    return cachedCredentials;
  }

  try {
    let yamlContent = await Deno.readTextFile(secretsPath);

    // Environment variable interpolation (same as config loader)
    yamlContent = yamlContent.replace(/\$\{?([a-zA-Z_][a-zA-Z0-9_]*)\}?/g, (match, varName) => {
      const value = Deno.env.get(varName);
      return value !== undefined ? value : match;
    });

    const parsed = parse(yamlContent);
    const result = firstPartyCredentialsSchema.safeParse(parsed);

    if (!result.success) {
      const errors = result.error.issues
        .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
        .join("\n");
      logger.error(`First-party credentials validation failed:\n${errors}`);
      cachedCredentials = {};
      return cachedCredentials;
    }

    cachedCredentials = result.data;
    logger.info(`Loaded first-party credentials for providers: ${Object.keys(cachedCredentials).join(", ")}`);
    return cachedCredentials;
  } catch (error) {
    logger.error("Failed to load first-party credentials:", error);
    cachedCredentials = {};
    return cachedCredentials;
  }
};

/**
 * Get first-party OAuth credentials for a specific provider
 */
export const getFirstPartyCredentials = async (
  providerId: string
): Promise<OAuthCredentials | null> => {
  const credentials = await loadFirstPartyCredentials();
  return credentials[providerId] ?? null;
};

/**
 * Check if first-party credentials are available for a provider
 */
export const hasFirstPartyCredentials = async (providerId: string): Promise<boolean> => {
  const credentials = await getFirstPartyCredentials(providerId);
  return credentials !== null;
};

/**
 * Resolve OAuth credentials - user-provided or first-party fallback
 *
 * @param providerId - The provider ID to look up first-party credentials
 * @param userCredentials - User-provided credentials (if any)
 * @returns Resolved credentials or null if neither available
 */
export const resolveOAuthCredentials = async (
  providerId: string,
  userCredentials?: { clientId?: string; clientSecret?: string }
): Promise<OAuthCredentials | null> => {
  // User-provided credentials take precedence
  if (userCredentials?.clientId && userCredentials?.clientSecret) {
    return {
      clientId: userCredentials.clientId,
      clientSecret: userCredentials.clientSecret,
    };
  }

  // Fall back to first-party credentials
  return getFirstPartyCredentials(providerId);
};

/**
 * Reset cached credentials (useful for testing)
 */
export const resetFirstPartyCredentialsCache = (): void => {
  cachedCredentials = null;
};
