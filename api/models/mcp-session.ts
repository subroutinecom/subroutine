import { randomUUID } from "node:crypto";
import { db } from "../db/index.ts";

export type McpSession = {
  id: string;
  organizationId: string;
  createdAt: string;
};

/**
 * Get the active MCP session for an organization.
 * Returns the most recent session if one exists.
 */
export async function getActiveSession(organizationId: string): Promise<McpSession | null> {
  const result = await db
    .selectFrom("mcp_session")
    .selectAll()
    .where("organization_id", "=", organizationId)
    .orderBy("created_at", "desc")
    .limit(1)
    .executeTakeFirst();

  if (!result) {
    return null;
  }

  return {
    id: result.id,
    organizationId: result.organization_id!,
    createdAt: result.created_at,
  };
}

/**
 * Create a new MCP session for an organization.
 */
export async function createSession(
  organizationId: string,
  sessionId?: string
): Promise<McpSession> {
  const id = sessionId || randomUUID();

  await db
    .insertInto("mcp_session")
    .values({
      id,
      organization_id: organizationId,
      created_at: new Date().toISOString(),
    })
    .execute();

  // Fetch the created session to get the timestamp
  const created = await db
    .selectFrom("mcp_session")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirstOrThrow();

  return {
    id: created.id,
    organizationId: created.organization_id!,
    createdAt: created.created_at,
  };
}

/**
 * Get a session by ID, verifying it belongs to the organization.
 */
export async function getSession(
  sessionId: string,
  organizationId: string
): Promise<McpSession | null> {
  const result = await db
    .selectFrom("mcp_session")
    .selectAll()
    .where("id", "=", sessionId)
    .where("organization_id", "=", organizationId)
    .executeTakeFirst();

  if (!result) {
    return null;
  }

  return {
    id: result.id,
    organizationId: result.organization_id!,
    createdAt: result.created_at,
  };
}

export async function getSessionById(sessionId: string): Promise<McpSession | null> {
  const result = await db
    .selectFrom("mcp_session")
    .selectAll()
    .where("id", "=", sessionId)
    .executeTakeFirst();

  if (!result) {
    return null;
  }

  return {
    id: result.id,
    organizationId: result.organization_id!,
    createdAt: result.created_at,
  };
}
