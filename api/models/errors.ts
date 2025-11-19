import type { IntegrationProvider } from "../integrations/providers.ts";

export class IntegrationAuthRequiredError extends Error {
  readonly integrationId: string;
  readonly provider: IntegrationProvider;
  readonly authorizationUrl: string;
  readonly state: string;
  readonly viewerId: string;

  constructor(params: {
    integrationId: string;
    provider: IntegrationProvider;
    authorizationUrl: string;
    state: string;
    viewerId: string;
    message?: string;
  }) {
    super(params.message ?? "Integration requires authorization");
    this.name = "IntegrationAuthRequiredError";
    this.integrationId = params.integrationId;
    this.provider = params.provider;
    this.authorizationUrl = params.authorizationUrl;
    this.state = params.state;
    this.viewerId = params.viewerId;
  }
}
