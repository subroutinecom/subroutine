import { nanoid } from "nanoid";
import { db } from "../db/index.ts";
import type { ConnectedAccountTable } from "../db/schema.ts";
import { decrypt, encrypt } from "../utils/encryption.ts";

export const CONNECTED_ACCOUNT_STATUS = [
  "active",
  "expired",
  "revoked",
  "error",
] as const;

export type ConnectedAccountStatus = typeof CONNECTED_ACCOUNT_STATUS[number];

export interface ConnectedAccountMetadata {
  providerAccountIdentifier?: string;
  viewerId?: string;
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
  userId: string;
  organizationId: string;
  credentials: ConnectedAccountCredentials;
  accountIdentifier?: string;
};

export type UpdateConnectedAccountRequest = {
  id: string;
  userId: string;
  organizationId: string;
  credentials?: ConnectedAccountCredentials;
  accountIdentifier?: string;
  status?: ConnectedAccountStatus;
};

export const createConnectedAccount = async (
  params: CreateConnectedAccountRequest,
): Promise<ConnectedAccountWithCredentials> => {
  const id = nanoid();
  const now = new Date().toISOString();

  const encryptedCredentials = encrypt(JSON.stringify(params.credentials));

  await db
    .insertInto("connected_account")
    .values({
      id,
      integrationId: params.integrationId,
      userId: params.userId,
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
    userId: params.userId,
    organizationId: params.organizationId,
    credentials: params.credentials,
    accountIdentifier: params.accountIdentifier || null,
    status: "active",
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now,
  };
};

export const listConnectedAccounts = async (
  userId: string,
  organizationId: string,
): Promise<ConnectedAccountWithCredentials[]> => {
  const rows = await db
    .selectFrom("connected_account")
    .selectAll()
    .where("userId", "=", userId)
    .where("organizationId", "=", organizationId)
    .orderBy("createdAt", "desc")
    .execute();

  return rows.map((row) => ({
    id: row.id,
    integrationId: row.integrationId,
    userId: row.userId,
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
  organizationId: string,
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
    userId: row.userId,
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
  userId: string,
  organizationId: string,
): Promise<ConnectedAccountWithCredentials | null> => {
  const row = await db
    .selectFrom("connected_account")
    .selectAll()
    .where("id", "=", id)
    .where("userId", "=", userId)
    .where("organizationId", "=", organizationId)
    .executeTakeFirst();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    integrationId: row.integrationId,
    userId: row.userId,
    organizationId: row.organizationId,
    credentials: JSON.parse(decrypt(row.credentials)),
    accountIdentifier: row.accountIdentifier,
    status: row.status as ConnectedAccountStatus,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

export const getConnectedAccountByIntegration = async (
  userId: string,
  integrationId: string,
  organizationId: string,
): Promise<ConnectedAccountWithCredentials | null> => {
  const row = await db
    .selectFrom("connected_account")
    .selectAll()
    .where("userId", "=", userId)
    .where("integrationId", "=", integrationId)
    .where("organizationId", "=", organizationId)
    .executeTakeFirst();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    integrationId: row.integrationId,
    userId: row.userId,
    organizationId: row.organizationId,
    credentials: JSON.parse(decrypt(row.credentials)),
    accountIdentifier: row.accountIdentifier,
    status: row.status as ConnectedAccountStatus,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

export const getConnectedAccountByAccountIdentifier = async (
  organizationId: string,
  integrationId: string,
  accountIdentifier: string,
): Promise<ConnectedAccountWithCredentials | null> => {
  const row = await db
    .selectFrom("connected_account")
    .selectAll()
    .where("organizationId", "=", organizationId)
    .where("integrationId", "=", integrationId)
    .where("accountIdentifier", "=", accountIdentifier)
    .executeTakeFirst();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    integrationId: row.integrationId,
    userId: row.userId,
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
  params: UpdateConnectedAccountRequest,
): Promise<ConnectedAccountWithCredentials | null> => {
  const existing = await getConnectedAccount(
    params.id,
    params.userId,
    params.organizationId,
  );

  if (!existing) {
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
    .where("userId", "=", params.userId)
    .where("organizationId", "=", params.organizationId)
    .execute();

  return getConnectedAccount(params.id, params.userId, params.organizationId);
};

export const updateLastUsed = async (
  id: string,
  userId: string,
  organizationId: string,
): Promise<void> => {
  const now = new Date().toISOString();

  await db
    .updateTable("connected_account")
    .set({
      lastUsedAt: now,
      updatedAt: now,
    })
    .where("id", "=", id)
    .where("userId", "=", userId)
    .where("organizationId", "=", organizationId)
    .execute();
};

export const deleteConnectedAccount = async (
  id: string,
  userId: string,
  organizationId: string,
): Promise<boolean> => {
  const result = await db
    .deleteFrom("connected_account")
    .where("id", "=", id)
    .where("userId", "=", userId)
    .where("organizationId", "=", organizationId)
    .executeTakeFirst();

  return (result?.numDeletedRows ?? 0n) > 0n;
};

export const connectedAccountExists = async (
  userId: string,
  integrationId: string,
  organizationId: string,
): Promise<boolean> => {
  const row = await db
    .selectFrom("connected_account")
    .select("id")
    .where("userId", "=", userId)
    .where("integrationId", "=", integrationId)
    .where("organizationId", "=", organizationId)
    .executeTakeFirst();

  return !!row;
};
