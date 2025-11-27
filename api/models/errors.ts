import type { IntegrationProvider } from "../integrations/providers.ts";

/**
 * Represents a single integration that requires user authorization.
 */
export interface AuthRequirement {
  integrationId: string;
  integrationName: string;
  provider: IntegrationProvider;
  authorizationUrl: string;
  state: string;
  patLinkUrl?: string;
  authInstructions?: string;
}

export class IntegrationAuthRequiredError extends Error {
  /** @deprecated Use requirements[0].integrationId instead */
  readonly integrationId: string;
  /** @deprecated Use requirements[0].provider instead */
  readonly provider: IntegrationProvider;
  /** @deprecated Use requirements[0].authorizationUrl instead */
  readonly authorizationUrl: string;
  /** @deprecated Use requirements[0].state instead */
  readonly state: string;
  readonly viewerId: string;

  /**
   * All integrations that require authorization.
   * Use this for handling multiple auth requirements at once.
   */
  readonly requirements: AuthRequirement[];

  constructor(params: { viewerId: string; requirements: AuthRequirement[]; message?: string });
  /** @deprecated Use the new constructor with requirements array */
  constructor(params: {
    integrationId: string;
    provider: IntegrationProvider;
    authorizationUrl: string;
    state: string;
    viewerId: string;
    message?: string;
  });
  constructor(
    params:
      | {
          viewerId: string;
          requirements: AuthRequirement[];
          message?: string;
        }
      | {
          integrationId: string;
          provider: IntegrationProvider;
          authorizationUrl: string;
          state: string;
          viewerId: string;
          message?: string;
        }
  ) {
    // Call super() first with computed message
    const message =
      "requirements" in params
        ? (params.message ??
          `Authentication required for: ${params.requirements.map((r) => r.integrationName).join(", ")}`)
        : (params.message ?? "Integration requires authorization");
    super(message);

    this.name = "IntegrationAuthRequiredError";

    // Determine which constructor form was used
    if ("requirements" in params) {
      // New form with requirements array
      this.requirements = params.requirements;
      this.viewerId = params.viewerId;

      // Set deprecated fields from first requirement for backwards compatibility
      const first = params.requirements[0];
      if (first) {
        this.integrationId = first.integrationId;
        this.provider = first.provider;
        this.authorizationUrl = first.authorizationUrl;
        this.state = first.state;
      } else {
        // Should never happen, but TypeScript needs these assigned
        this.integrationId = "";
        this.provider = "mcp" as IntegrationProvider;
        this.authorizationUrl = "";
        this.state = "";
      }
    } else {
      // Legacy form with single integration
      this.integrationId = params.integrationId;
      this.provider = params.provider;
      this.authorizationUrl = params.authorizationUrl;
      this.state = params.state;
      this.viewerId = params.viewerId;

      // Build requirements array from single integration for forward compatibility
      this.requirements = [
        {
          integrationId: params.integrationId,
          integrationName: params.integrationId, // Best we can do without the name
          provider: params.provider,
          authorizationUrl: params.authorizationUrl,
          state: params.state,
        },
      ];
    }
  }
}
