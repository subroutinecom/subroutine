import type { Account, Session, User, Verification } from "better-auth/db";
import type { Invitation, Member, Organization } from "better-auth/plugins/organization";

export interface Database {
  subroutine: SubroutineTable;
  run: RunTable;
  subroutine_integration: SubroutineIntegrationTable;
  apikey: ApiKeyTable;
  integration: IntegrationTable;
  connected_account: ConnectedAccountTable;
  user: User;
  session: Session;
  account: Account;
  verification: Verification;
  organization: Organization;
  member: Member;
  invitation: Invitation;
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
  authConfig: string;
  enabled: boolean;
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
