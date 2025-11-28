import { nanoid } from "nanoid";
import { db } from "../db/index.ts";
import type { ConnectedAccountTable } from "../db/schema.ts";
import { decrypt, encrypt } from "../utils/encryption.ts";

export const CONNECTED_ACCOUNT_STATUS = ["active", "expired", "revoked", "error"] as const;

export type ConnectedAccountStatus = (typeof CONNECTED_ACCOUNT_STATUS)[number];

export interface ConnectedAccountMetadata {
  providerAccountIdentifier?: string;
  [key: string]: unknown;
}

export interface ConnectedAccountCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType: "Bearer";
  scope?: string;
  metadata?: ConnectedAccountMetadata;
}

export interface ConnectedAccountWithCredentials
  extends Omit<ConnectedAccountTable, "credentials" | "status"> {
  credentials: ConnectedAccountCredentials;
  status: ConnectedAccountStatus;
}

export type CreateConnectedAccountRequest = {
  integrationId: string;
  viewerId: string;
  organizationId: string;
  credentials: ConnectedAccountCredentials;
  accountIdentifier?: string;
};

export type UpdateConnectedAccountRequest = {
  id: string;
  viewerId: string;
  organizationId: string;
  credentials?: ConnectedAccountCredentials;
  accountIdentifier?: string;
  status?: ConnectedAccountStatus;
};

export const createConnectedAccount = async (
  params: CreateConnectedAccountRequest
): Promise<ConnectedAccountWithCredentials> => {
  const now = new Date().toISOString();
  const encryptedCredentials = encrypt(JSON.stringify(params.credentials));

  // Check if a connected account already exists for this viewer + integration
  const existing = await getConnectedAccountByViewer(
    params.viewerId,
    params.integrationId,
    params.organizationId
  );

  if (existing) {
    // Update existing connected account with new credentials
    await db
      .updateTable("connected_account")
      .set({
        credentials: encryptedCredentials,
        accountIdentifier: params.accountIdentifier || existing.accountIdentifier,
        status: "active",
        updatedAt: now,
      })
      .where("id", "=", existing.id)
      .execute();

    return {
      id: existing.id,
      integrationId: params.integrationId,
      viewerId: params.viewerId,
      organizationId: params.organizationId,
      credentials: params.credentials,
      accountIdentifier: params.accountIdentifier || existing.accountIdentifier,
      status: "active",
      lastUsedAt: existing.lastUsedAt,
      createdAt: existing.createdAt,
      updatedAt: now,
    };
  }

  // Create new connected account
  const id = nanoid();

  await db
    .insertInto("connected_account")
    .values({
      id,
      integrationId: params.integrationId,
      viewerId: params.viewerId,
      organizationId: params.organizationId,
      credentials: encryptedCredentials,
      accountIdentifier: params.accountIdentifier || null,
      status: "active",
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .execute();

  return {
    id,
    integrationId: params.integrationId,
    viewerId: params.viewerId,
    organizationId: params.organizationId,
    credentials: params.credentials,
    accountIdentifier: params.accountIdentifier || null,
    status: "active",
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now,
  };
};

export const listConnectedAccountsByOrganization = async (
  organizationId: string
): Promise<ConnectedAccountWithCredentials[]> => {
  const rows = await db
    .selectFrom("connected_account")
    .selectAll()
    .where("organizationId", "=", organizationId)
    .orderBy("createdAt", "desc")
    .execute();

  return rows.map((row) => ({
    id: row.id,
    integrationId: row.integrationId,
    viewerId: row.viewerId,
    organizationId: row.organizationId,
    credentials: JSON.parse(decrypt(row.credentials)),
    accountIdentifier: row.accountIdentifier,
    status: row.status as ConnectedAccountStatus,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
};

export const listConnectedAccountsByIntegration = async (
  integrationId: string,
  organizationId: string
): Promise<ConnectedAccountWithCredentials[]> => {
  const rows = await db
    .selectFrom("connected_account")
    .selectAll()
    .where("integrationId", "=", integrationId)
    .where("organizationId", "=", organizationId)
    .orderBy("createdAt", "desc")
    .execute();

  return rows.map((row) => ({
    id: row.id,
    integrationId: row.integrationId,
    viewerId: row.viewerId,
    organizationId: row.organizationId,
    credentials: JSON.parse(decrypt(row.credentials)),
    accountIdentifier: row.accountIdentifier,
    status: row.status as ConnectedAccountStatus,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
};

export const getConnectedAccount = async (
  id: string,
  organizationId: string
): Promise<ConnectedAccountWithCredentials | null> => {
  const row = await db
    .selectFrom("connected_account")
    .selectAll()
    .where("id", "=", id)
    .where("organizationId", "=", organizationId)
    .executeTakeFirst();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    integrationId: row.integrationId,
    viewerId: row.viewerId,
    organizationId: row.organizationId,
    credentials: JSON.parse(decrypt(row.credentials)),
    accountIdentifier: row.accountIdentifier,
    status: row.status as ConnectedAccountStatus,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

export const getConnectedAccountByViewer = async (
  viewerId: string,
  integrationId: string,
  organizationId: string
): Promise<ConnectedAccountWithCredentials | null> => {
  const row = await db
    .selectFrom("connected_account")
    .selectAll()
    .where("viewerId", "=", viewerId)
    .where("integrationId", "=", integrationId)
    .where("organizationId", "=", organizationId)
    .executeTakeFirst();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    integrationId: row.integrationId,
    viewerId: row.viewerId,
    organizationId: row.organizationId,
    credentials: JSON.parse(decrypt(row.credentials)),
    accountIdentifier: row.accountIdentifier,
    status: row.status as ConnectedAccountStatus,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

export const updateConnectedAccount = async (
  params: UpdateConnectedAccountRequest
): Promise<ConnectedAccountWithCredentials | null> => {
  const existing = await getConnectedAccount(params.id, params.organizationId);

  if (!existing) {
    return null;
  }

  // Verify viewerId matches
  if (existing.viewerId !== params.viewerId) {
    return null;
  }

  const now = new Date().toISOString();

  const updateValues: {
    credentials?: string;
    accountIdentifier?: string | null;
    status?: string;
    updatedAt: string;
  } = {
    updatedAt: now,
  };

  if (params.credentials !== undefined) {
    updateValues.credentials = encrypt(JSON.stringify(params.credentials));
  }

  if (params.accountIdentifier !== undefined) {
    updateValues.accountIdentifier = params.accountIdentifier;
  }

  if (params.status !== undefined) {
    updateValues.status = params.status;
  }

  await db
    .updateTable("connected_account")
    .set(updateValues)
    .where("id", "=", params.id)
    .where("organizationId", "=", params.organizationId)
    .execute();

  return getConnectedAccount(params.id, params.organizationId);
};

export const deleteConnectedAccount = async (
  id: string,
  organizationId: string
): Promise<boolean> => {
  const result = await db
    .deleteFrom("connected_account")
    .where("id", "=", id)
    .where("organizationId", "=", organizationId)
    .executeTakeFirst();

  return (result?.numDeletedRows ?? 0n) > 0n;
};

export const getConnectedIntegrationIds = async (
  viewerId: string,
  organizationId: string
): Promise<Set<string>> => {
  const rows = await db
    .selectFrom("connected_account")
    .select("integrationId")
    .where("viewerId", "=", viewerId)
    .where("organizationId", "=", organizationId)
    .where("status", "=", "active")
    .execute();

  return new Set(rows.map((r) => r.integrationId));
};

/**
 * Get all connected accounts for a viewer as a Map keyed by integrationId.
 */
export const getConnectedAccountsByViewer = async (
  viewerId: string,
  organizationId: string
): Promise<Map<string, ConnectedAccountWithCredentials>> => {
  const rows = await db
    .selectFrom("connected_account")
    .selectAll()
    .where("viewerId", "=", viewerId)
    .where("organizationId", "=", organizationId)
    .where("status", "=", "active")
    .execute();

  const map = new Map<string, ConnectedAccountWithCredentials>();
  for (const row of rows) {
    map.set(row.integrationId, {
      id: row.id,
      integrationId: row.integrationId,
      viewerId: row.viewerId,
      organizationId: row.organizationId,
      credentials: JSON.parse(decrypt(row.credentials)),
      accountIdentifier: row.accountIdentifier,
      status: row.status as ConnectedAccountStatus,
      lastUsedAt: row.lastUsedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
  return map;
};
