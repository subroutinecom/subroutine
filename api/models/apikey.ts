import bcrypt from "bcrypt";
import { nanoid } from "nanoid";
import { randomBytes } from "node:crypto";
import { db } from "../db/index";
import { requireApproval } from "./userApproval";

const SALT_ROUNDS = 10;

export type ApiKey = {
  id: string;
  name?: string | null;
  start?: string | null;
  prefix?: string | null;
  key: string;
  userId: string;
  organizationId: string;
  enabled?: boolean | null;
  expiresAt?: string | null;
  permissions?: string | null;
  metadata?: Record<string, any> | null;
  rateLimitEnabled?: boolean | null;
  rateLimitTimeWindow?: number | null;
  rateLimitMax?: number | null;
  requestCount?: number | null;
  remaining?: number | null;
  lastRequest?: string | null;
  refillInterval?: number | null;
  refillAmount?: number | null;
  lastRefillAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateApiKeyRequest = {
  userId: string;
  organizationId: string;
  name?: string;
  prefix?: string;
  metadata?: Record<string, any>;
};

export type UpdateApiKeyRequest = {
  id: string;
  userId: string;
  organizationId: string;
  name?: string;
  metadata?: Record<string, any>;
};

const generateApiKey = (prefix?: string): string => {
  const keyBytes = randomBytes(32);
  const keyString = keyBytes.toString("base64url");
  return prefix ? `${prefix}_${keyString}` : keyString;
};

export const createApiKey = async (params: CreateApiKeyRequest): Promise<ApiKey> => {
  await requireApproval(params.userId, params.organizationId);

  const id = nanoid();
  const key = generateApiKey(params.prefix);
  const now = new Date().toISOString();
  const start = key.substring(0, 8);
  const keyHash = await bcrypt.hash(key, SALT_ROUNDS);

  await db
    .insertInto("apikey")
    .values({
      id,
      name: params.name || null,
      start,
      prefix: params.prefix || null,
      key: keyHash,
      userId: params.userId,
      organizationId: params.organizationId,
      enabled: true,
      expiresAt: null,
      permissions: null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      rateLimitEnabled: null,
      rateLimitTimeWindow: null,
      rateLimitMax: null,
      requestCount: null,
      remaining: null,
      lastRequest: null,
      refillInterval: null,
      refillAmount: null,
      lastRefillAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .execute();

  return {
    id,
    name: params.name || null,
    start,
    prefix: params.prefix || null,
    key, // Plain key returned only on creation
    userId: params.userId,
    organizationId: params.organizationId,
    enabled: true,
    expiresAt: null,
    permissions: null,
    metadata: params.metadata || null,
    rateLimitEnabled: null,
    rateLimitTimeWindow: null,
    rateLimitMax: null,
    requestCount: null,
    remaining: null,
    lastRequest: null,
    refillInterval: null,
    refillAmount: null,
    lastRefillAt: null,
    createdAt: now,
    updatedAt: now,
  };
};

export const listApiKeys = async (userId: string, organizationId: string): Promise<ApiKey[]> => {
  const rows = await db
    .selectFrom("apikey")
    .selectAll()
    .where("userId", "=", userId)
    .where("organizationId", "=", organizationId)
    .orderBy("createdAt", "desc")
    .execute();

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    start: row.start,
    prefix: row.prefix,
    key: "", // Never return the key after creation
    userId: row.userId,
    organizationId: row.organizationId,
    enabled: row.enabled,
    expiresAt: row.expiresAt,
    permissions: row.permissions,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    rateLimitEnabled: row.rateLimitEnabled,
    rateLimitTimeWindow: row.rateLimitTimeWindow,
    rateLimitMax: row.rateLimitMax,
    requestCount: row.requestCount,
    remaining: row.remaining,
    lastRequest: row.lastRequest,
    refillInterval: row.refillInterval,
    refillAmount: row.refillAmount,
    lastRefillAt: row.lastRefillAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
};

export const getApiKey = async (
  id: string,
  userId: string,
  organizationId: string
): Promise<ApiKey | null> => {
  const row = await db
    .selectFrom("apikey")
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
    name: row.name,
    start: row.start,
    prefix: row.prefix,
    key: "", // Never return the key after creation
    userId: row.userId,
    organizationId: row.organizationId,
    enabled: row.enabled,
    expiresAt: row.expiresAt,
    permissions: row.permissions,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    rateLimitEnabled: row.rateLimitEnabled,
    rateLimitTimeWindow: row.rateLimitTimeWindow,
    rateLimitMax: row.rateLimitMax,
    requestCount: row.requestCount,
    remaining: row.remaining,
    lastRequest: row.lastRequest,
    refillInterval: row.refillInterval,
    refillAmount: row.refillAmount,
    lastRefillAt: row.lastRefillAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

export const updateApiKey = async (params: UpdateApiKeyRequest): Promise<ApiKey | null> => {
  await requireApproval(params.userId, params.organizationId);

  const existing = await getApiKey(params.id, params.userId, params.organizationId);

  if (!existing) {
    return null;
  }

  const now = new Date().toISOString();

  await db
    .updateTable("apikey")
    .set({
      name: params.name !== undefined ? params.name : existing.name,
      metadata: params.metadata
        ? JSON.stringify(params.metadata)
        : existing.metadata
          ? JSON.stringify(existing.metadata)
          : null,
      updatedAt: now,
    })
    .where("id", "=", params.id)
    .where("userId", "=", params.userId)
    .where("organizationId", "=", params.organizationId)
    .execute();

  return getApiKey(params.id, params.userId, params.organizationId);
};

export const deleteApiKey = async (
  id: string,
  userId: string,
  organizationId: string
): Promise<boolean> => {
  await requireApproval(userId, organizationId);

  const result = await db
    .deleteFrom("apikey")
    .where("id", "=", id)
    .where("userId", "=", userId)
    .where("organizationId", "=", organizationId)
    .executeTakeFirst();

  return (result?.numDeletedRows ?? 0n) > 0n;
};

export const verifyApiKey = async (
  apiKey: string
): Promise<{ userId: string; organizationId: string } | null> => {
  // Use the indexed "start" column (first 8 chars of the key) to
  // dramatically shrink the candidate set before bcrypt comparison.
  const candidateStart = apiKey.substring(0, 8);

  const candidates = await db
    .selectFrom("apikey")
    .select(["id", "key", "userId", "organizationId", "enabled", "expiresAt", "start"])
    .where("enabled", "=", true)
    .where("start", "=", candidateStart)
    .execute();

  for (const keyRecord of candidates) {
    if (keyRecord.expiresAt) {
      const expiryDate = new Date(keyRecord.expiresAt);
      if (expiryDate < new Date()) {
        continue;
      }
    }

    const isValid = await bcrypt.compare(apiKey, keyRecord.key);
    if (isValid) {
      return {
        userId: keyRecord.userId,
        organizationId: keyRecord.organizationId,
      };
    }
  }

  return null;
};
