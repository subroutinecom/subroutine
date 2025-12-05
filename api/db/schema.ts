import type { Account, Session, User, Verification } from "better-auth/db";
import type { Invitation, Member, Organization } from "better-auth/plugins/organization";

export interface Database {
  subroutine: SubroutineTable;
  run: RunTable;
  subroutine_integration: SubroutineIntegrationTable;
  apikey: ApiKeyTable;
  integration: IntegrationTable;
  connected_account: ConnectedAccountTable;
  pat_link: PatLinkTable;
  mcp_session: McpSessionTable;
  user: User;
  session: Session;
  account: Account;
  verification: Verification;
  organization: Organization;
  member: Member;
  invitation: Invitation;

  // these are used by MCP plugin.
  // The same tables as oidc provider plugin - may be useful
  // in the future
  oauthApplication: OAuthApplicationTable;
  oauthAccessToken: OAuthAccessTokenTable;
  oauthConsent: OAuthConsentTable;
}

export interface McpSessionTable {
  id: string;
  organization_id: string | null;
  created_at: string;
}

export interface SubroutineTable {
  id: string;
  organization_id: string | null;
  source: string;
  inputs_schema: string | null;
  outputs_schema: string | null;
  created_from_request: string;
  created_at: string;
}

export interface RunTable {
  id: string;
  subroutine_id: string;
  organization_id: string | null;
  status: "queued" | "running" | "succeeded" | "failed";
  started_at: string | null;
  ended_at: string | null;
  outputs: string | null;
  error: string | null;
}

export interface SubroutineIntegrationTable {
  subroutine_id: string;
  integration_id: string;
  organization_id: string;
  created_at: string;
}

export interface ApiKeyTable {
  id: string;
  name: string | null;
  start: string | null;
  prefix: string | null;
  key: string; // Stores bcrypt hash of the API key
  userId: string;
  organizationId: string;
  enabled: boolean | null;
  expiresAt: string | null;
  permissions: string | null;
  metadata: string | null;
  // Rate limiting fields
  rateLimitEnabled: boolean | null;
  rateLimitTimeWindow: number | null;
  rateLimitMax: number | null;
  requestCount: number | null;
  remaining: number | null;
  lastRequest: string | null;
  // Refill fields
  refillInterval: number | null;
  refillAmount: number | null;
  lastRefillAt: string | null;
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationTable {
  id: string;
  organizationId: string;
  provider: string;
  name: string;
  description: string | null; // AI-readable description for integration selection
  authConfig: string;
  enabled: boolean;
  status: string; // "static" = manual/normal, "dynamic" = AI-managed
  visibility: string; // "private" = org-specific, "global" = first-party registry
  createdAt: string;
  updatedAt: string;
}

export interface ConnectedAccountTable {
  id: string;
  integrationId: string;
  viewerId: string;
  organizationId: string;
  credentials: string;
  accountIdentifier: string | null;
  status: string;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PatLinkTable {
  id: string;
  integrationId: string;
  viewerId: string;
  organizationId: string;
  status: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OAuthApplicationTable {
  id: string;
  name: string;
  icon: string | null;
  metadata: string | null;
  clientId: string;
  clientSecret: string | null;
  redirectURLs: string;
  type: string;
  disabled: boolean | null;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OAuthAccessTokenTable {
  id: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  clientId: string;
  userId: string | null;
  scopes: string;
  createdAt: string;
  updatedAt: string;
}

export interface OAuthConsentTable {
  id: string;
  clientId: string;
  userId: string;
  scopes: string;
  createdAt: string;
  updatedAt: string;
  consentGiven: boolean;
}
