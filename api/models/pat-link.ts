import { nanoid } from "nanoid";
import { db } from "../db/index.ts";
import type { PatLinkTable } from "../db/schema.ts";
import { getConfig } from "../config/loader.ts";
import { getIntegration, type McpAuthConfig } from "./integration.ts";
import { createConnectedAccount, type ConnectedAccountCredentials } from "./connected-account.ts";
import { getLogger } from "../utils/logger.ts";
const logger = getLogger("models.pat-link");


export const PAT_LINK_STATUS = ["pending", "used", "expired"] as const;

export type PatLinkStatus = (typeof PAT_LINK_STATUS)[number];

export interface PatLink extends Omit<PatLinkTable, "status"> {
  status: PatLinkStatus;
}

export interface PatLinkWithIntegration extends PatLink {
  integration: {
    id: string;
    name: string;
    authInstructions?: string;
    patLabel?: string;
    helpUrl?: string;
  };
}

export type GeneratePatLinkParams = {
  integrationId: string;
  viewerId: string;
  organizationId: string;
  expiresInHours?: number;
};

export type GeneratePatLinkResult = {
  url: string;
  id: string;
  expiresAt: string;
};

export const generatePatLinkUrl = async (
  params: GeneratePatLinkParams
): Promise<GeneratePatLinkResult> => {
  const { integrationId, viewerId, organizationId, expiresInHours = 1 } = params;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInHours * 60 * 60 * 1000);

  const id = nanoid();

  await db
    .insertInto("pat_link")
    .values({
      id,
      integrationId,
      viewerId,
      organizationId,
      status: "pending",
      expiresAt: expiresAt.toISOString(),
      usedAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    })
    .execute();

  const config = await getConfig();
  const url = `${config.baseUrl}/pat/${id}`;

  return {
    url,
    id,
    expiresAt: expiresAt.toISOString(),
  };
};

export const getPatLink = async (id: string): Promise<PatLink | null> => {
  const row = await db.selectFrom("pat_link").selectAll().where("id", "=", id).executeTakeFirst();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    integrationId: row.integrationId,
    viewerId: row.viewerId,
    organizationId: row.organizationId,
    status: row.status as PatLinkStatus,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

export const getPatLinkWithIntegration = async (
  id: string
): Promise<PatLinkWithIntegration | null> => {
  const patLink = await getPatLink(id);

  if (!patLink) {
    return null;
  }

  const integration = await getIntegration(patLink.integrationId, patLink.organizationId);

  if (!integration) {
    return null;
  }

  const mcpConfig = integration.authConfig as McpAuthConfig;
  const metadata = mcpConfig.metadata || {};

  return {
    ...patLink,
    integration: {
      id: integration.id,
      name: integration.name,
      authInstructions: metadata.authInstructions as string | undefined,
      patLabel: metadata.patLabel as string | undefined,
      helpUrl: metadata.helpUrl as string | undefined,
    },
  };
};

export type ValidatePatLinkResult = {
  valid: boolean;
  error?: string;
  patLink?: PatLinkWithIntegration;
};

export const validatePatLink = async (id: string): Promise<ValidatePatLinkResult> => {
  const patLink = await getPatLinkWithIntegration(id);

  if (!patLink) {
    return { valid: false, error: "Invalid or expired link" };
  }

  if (patLink.status === "used") {
    return { valid: false, error: "Invalid or expired link" };
  }

  if (patLink.status === "expired") {
    return { valid: false, error: "Invalid or expired link" };
  }

  const now = new Date();
  const expiresAt = new Date(patLink.expiresAt);

  if (now > expiresAt) {
    await markPatLinkExpired(id);
    return { valid: false, error: "Invalid or expired link" };
  }

  return { valid: true, patLink };
};

export const markPatLinkUsed = async (id: string): Promise<boolean> => {
  const now = new Date().toISOString();

  const result = await db
    .updateTable("pat_link")
    .set({
      status: "used",
      usedAt: now,
      updatedAt: now,
    })
    .where("id", "=", id)
    .where("status", "=", "pending")
    .executeTakeFirst();

  return (result?.numUpdatedRows ?? 0n) > 0n;
};

export const markPatLinkExpired = async (id: string): Promise<boolean> => {
  const now = new Date().toISOString();

  const result = await db
    .updateTable("pat_link")
    .set({
      status: "expired",
      updatedAt: now,
    })
    .where("id", "=", id)
    .where("status", "=", "pending")
    .executeTakeFirst();

  return (result?.numUpdatedRows ?? 0n) > 0n;
};

export type SubmitPatLinkResult = {
  success: boolean;
  error?: string;
};

export const submitPatLink = async (id: string, pat: string): Promise<SubmitPatLinkResult> => {
  const validation = await validatePatLink(id);

  if (!validation.valid || !validation.patLink) {
    return { success: false, error: validation.error || "Invalid or expired link" };
  }

  const patLink = validation.patLink;

  const credentials: ConnectedAccountCredentials = {
    accessToken: pat,
    refreshToken: "",
    expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
    tokenType: "Bearer",
    metadata: {
      source: "pat_link",
      patLinkId: id,
    },
  };

  try {
    await createConnectedAccount({
      integrationId: patLink.integrationId,
      viewerId: patLink.viewerId,
      organizationId: patLink.organizationId,
      credentials,
    });

    await markPatLinkUsed(id);

    return { success: true };
  } catch (error) {
    logger.error("Failed to create connected account:", error);
    return { success: false, error: "Failed to save token" };
  }
};

export const listPatLinksByOrganization = async (organizationId: string): Promise<PatLink[]> => {
  const rows = await db
    .selectFrom("pat_link")
    .selectAll()
    .where("organizationId", "=", organizationId)
    .orderBy("createdAt", "desc")
    .execute();

  return rows.map((row) => ({
    id: row.id,
    integrationId: row.integrationId,
    viewerId: row.viewerId,
    organizationId: row.organizationId,
    status: row.status as PatLinkStatus,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
};

export const deletePatLink = async (id: string, organizationId: string): Promise<boolean> => {
  const result = await db
    .deleteFrom("pat_link")
    .where("id", "=", id)
    .where("organizationId", "=", organizationId)
    .executeTakeFirst();

  return (result?.numDeletedRows ?? 0n) > 0n;
};
