import type { Account, Session, User, Verification } from "better-auth/db";
import type {
  Invitation,
  Member,
  Organization,
} from "better-auth/plugins/organization";

export interface Database {
  subroutine: SubroutineTable;
  run: RunTable;
  apikey: ApiKeyTable;
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
  source: string;
  inputs_schema: string | null;
  outputs_schema: string | null;
  created_from_request: string;
  created_at: string;
}

export interface RunTable {
  id: string;
  subroutine_id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  started_at: string | null;
  ended_at: string | null;
  outputs: string | null;
  error: string | null;
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
