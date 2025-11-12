import type { Account, Session, User, Verification } from "better-auth/db";
import type {
  Invitation,
  Member,
  Organization,
} from "better-auth/plugins/organization";

export interface Database {
  subroutine: SubroutineTable;
  run: RunTable;
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
