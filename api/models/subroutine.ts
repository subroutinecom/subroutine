import { nanoid } from "nanoid";
import { createModel, generateCode, type McpContext } from "../agent/index";
import type { IntegrationInfo } from "../agent/prompts/index";
import { Capability } from "../agent/utils/types";
import { db } from "../db/index";
import { generateMockCode } from "../mocks";
import { getLogger } from "../utils/logger";
import { getIntegration } from "./integration";
import { runSubroutine, type Run } from "./run";
const logger = getLogger("api/models/subroutine.ts");

export type Subroutine = {
  id: string;
  organizationId: string;
  integrationIds: string[];
  // TODO: We probably should consider moving this to a blob
  source: string;
  inputsSchema?: Record<string, unknown>;
  outputsSchema?: Record<string, unknown>;
  initialInputs?: Record<string, unknown>;
  createdFrom: {
    request: string;
  };
  createdAt: string;
};

export type GenerateSubroutineRequest = {
  request: string;
  organizationId: string;
  viewerId: string;
  integrations?: string[];
  useMock?: boolean;
};

/**
 * Builds integration info for the code generation prompt.
 * This retrieves basic identifying info (name, id, type) for MCP, GraphQL, and OpenAPI integrations.
 *
 * Auth checking and capability discovery happens lazily during code generation
 * via the inspectIntegration agent tool.
 */
const buildIntegrationInfo = async (
  organizationId: string,
  integrationIds: string[]
): Promise<{ integrations: IntegrationInfo[]; nameToId: Map<string, string> }> => {
  if (integrationIds.length === 0) {
    return { integrations: [], nameToId: new Map() };
  }

  const integrations: IntegrationInfo[] = [];
  const nameToId = new Map<string, string>();

  for (const integrationId of integrationIds) {
    const integration = await getIntegration(integrationId, organizationId);
    if (!integration) continue;

    // Only include MCP, GraphQL, and OpenAPI integrations
    const configType = integration.authConfig.type;
    if (configType !== "mcp" && configType !== "graphql" && configType !== "openapi") continue;

    integrations.push({
      id: integrationId,
      name: integration.name,
      type: configType,
    });
    nameToId.set(integration.name, integrationId);
  }

  return { integrations, nameToId };
};

export const generateSubroutine = async (
  params: GenerateSubroutineRequest
): Promise<Subroutine> => {
  const resolvedIntegrationIds = await resolveIntegrationAliases(
    params.organizationId,
    params.integrations
  );
  const subroutineId = nanoid();

  let source: string;
  let inputsSchema: Record<string, unknown> = {
    type: "object",
    properties: {},
  };
  let outputsSchema: Record<string, unknown> = {
    type: "object",
    properties: {},
  };
  let initialInputs: Record<string, unknown> | undefined;

  if (params.useMock) {
    logger.info(`Using mock code generation for "${params.request}" (requested via useMock flag)`);
    source = generateMockCode(params.request);
  } else {
    const model = await createModel(Capability.CODING);
    logger.info(
      `[generateSubroutine] Using model: ${(model as { modelId?: string })?.modelId ?? "none"}`
    );
    logger.info(
      `[generateSubroutine] Integrations passed: ${params.integrations?.join(", ") || "none"}`
    );
    logger.info(`Viewer: ${params.viewerId}`);

    if (!model) {
      throw new Error("No model provider configured. Check config.yaml for AI model settings.");
    }

    // Build integration info for the prompt (just names, IDs, and types)
    // Auth checking and capability discovery happens lazily via the inspectIntegration agent tool
    const { integrations, nameToId } = await buildIntegrationInfo(
      params.organizationId,
      resolvedIntegrationIds
    );

    // Build context for the agent to use when calling inspectIntegration
    // ALWAYS provide mcpContext - in discovery mode (no integrations), the agent needs
    // access to getOrganizationIntegrations and getGlobalIntegrations tools
    const mcpContext: McpContext = {
      organizationId: params.organizationId,
      viewerId: params.viewerId,
      integrationNameToId: nameToId,
    };

    const result = await generateCode(model, params.request, {
      firstPartyIntegrations: params.integrations ?? [],
      integrations,
      mcpContext,
    });

    if (!result.success) {
      throw new Error(`Code generation failed: ${result.error}`);
    }

    source = result.source;
    inputsSchema = result.inputsSchema;
    outputsSchema = result.outputsSchema;

    // In discovery mode, merge any integrations discovered during code generation
    if (result.usedIntegrationIds && result.usedIntegrationIds.length > 0) {
      logger.info(
        `[generateSubroutine] usedIntegrationIds from code gen: ${result.usedIntegrationIds.join(", ")}`
      );
      for (const id of result.usedIntegrationIds) {
        if (!resolvedIntegrationIds.includes(id)) {
          resolvedIntegrationIds.push(id);
        }
      }
      logger.info(
        `[generateSubroutine] Merged discovered integrations. Final list: ${resolvedIntegrationIds.join(", ")}`
      );
    }

    logger.info(
      `[generateSubroutine] Integration IDs to store with subroutine: ${resolvedIntegrationIds.join(", ") || "none"}`
    );
    logger.info(
      `[generateSubroutine] Generated code preview (first 200 chars): ${source.substring(0, 200)}...`
    );
  }

  const createdAt = new Date().toISOString();

  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto("subroutine")
      .values({
        id: subroutineId,
        organization_id: params.organizationId,
        source,
        inputs_schema: JSON.stringify(inputsSchema),
        outputs_schema: JSON.stringify(outputsSchema),
        created_from_request: params.request,
        created_at: createdAt,
      })
      .execute();

    if (resolvedIntegrationIds.length > 0) {
      await trx
        .insertInto("subroutine_integration")
        .values(
          resolvedIntegrationIds.map((integrationId) => ({
            subroutine_id: subroutineId,
            integration_id: integrationId,
            organization_id: params.organizationId,
            created_at: createdAt,
          }))
        )
        .execute();
    }
  });

  return {
    id: subroutineId,
    organizationId: params.organizationId,
    integrationIds: resolvedIntegrationIds,
    source,
    inputsSchema,
    outputsSchema,
    initialInputs,
    createdFrom: {
      request: params.request,
    },
    createdAt,
  };
};

export const getSubroutine = async (
  id: string,
  organizationId: string
): Promise<Subroutine | undefined> => {
  const row = await db
    .selectFrom("subroutine")
    .selectAll()
    .where("id", "=", id)
    .where("organization_id", "=", organizationId)
    .executeTakeFirst();

  if (!row) {
    return undefined;
  }

  const integrationMap = await fetchIntegrationIdsForSubroutines([row.id]);

  return mapRowToSubroutine(row, integrationMap.get(row.id) ?? [], organizationId);
};

export const listSubroutines = async (organizationId: string): Promise<Subroutine[]> => {
  const results = await db
    .selectFrom("subroutine")
    .selectAll()
    .where("organization_id", "=", organizationId)
    .orderBy("created_at", "desc")
    .execute();

  if (results.length === 0) {
    return [];
  }

  const integrationMap = await fetchIntegrationIdsForSubroutines(results.map((row) => row.id));

  return results.map((row) =>
    mapRowToSubroutine(row, integrationMap.get(row.id) ?? [], organizationId)
  );
};

const resolveIntegrationAliases = async (
  organizationId: string,
  aliases?: string[]
): Promise<string[]> => {
  const normalizedAliases = normalizeIntegrationAliases(aliases);
  if (normalizedAliases.length === 0) {
    return [];
  }

  const rows = await db
    .selectFrom("integration")
    .select(["id", "name"])
    .where("organizationId", "=", organizationId)
    .where((eb) => eb("name", "in", normalizedAliases).or("id", "in", normalizedAliases))
    .execute();

  const idByAlias = new Map<string, string>();
  for (const row of rows) {
    idByAlias.set(row.name, row.id);
    idByAlias.set(row.id, row.id);
  }

  const missing = normalizedAliases.filter((alias) => !idByAlias.has(alias));
  if (missing.length > 0) {
    throw new Error(`Unknown integrations: ${missing.map((alias) => `'${alias}'`).join(", ")}`);
  }

  return normalizedAliases.map((alias) => idByAlias.get(alias)!);
};

const normalizeIntegrationAliases = (aliases?: string[]): string[] => {
  if (!aliases || aliases.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const alias of aliases) {
    if (!alias || typeof alias !== "string") {
      continue;
    }
    const trimmed = alias.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
};

const fetchIntegrationIdsForSubroutines = async (
  subroutineIds: string[]
): Promise<Map<string, string[]>> => {
  if (subroutineIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .selectFrom("subroutine_integration")
    .select(["subroutine_id", "integration_id"])
    .where("subroutine_id", "in", subroutineIds)
    .orderBy("created_at", "asc")
    .execute();

  const map = new Map<string, string[]>();
  for (const row of rows) {
    const existing = map.get(row.subroutine_id) ?? [];
    existing.push(row.integration_id);
    map.set(row.subroutine_id, existing);
  }
  return map;
};

const mapRowToSubroutine = (
  row: {
    id: string;
    organization_id: string | null;
    source: string;
    inputs_schema: string | null;
    outputs_schema: string | null;
    created_from_request: string;
    created_at: string;
  },
  integrationIds: string[],
  fallbackOrganizationId: string
): Subroutine => ({
  id: row.id,
  organizationId: row.organization_id ?? fallbackOrganizationId,
  integrationIds,
  source: row.source,
  inputsSchema: row.inputs_schema ? JSON.parse(row.inputs_schema) : undefined,
  outputsSchema: row.outputs_schema ? JSON.parse(row.outputs_schema) : undefined,
  createdFrom: {
    request: row.created_from_request,
  },
  createdAt: row.created_at,
});

export type ExecuteRequestParams = {
  request: string;
  organizationId: string;
  viewerId: string;
  integrations?: string[];
  timeoutMs?: number;
  useMock?: boolean;
  wait?: boolean;
};

export type ExecuteRequestResult = {
  subroutine: Subroutine;
  run: Run;
};

export const executeRequest = async (
  params: ExecuteRequestParams
): Promise<ExecuteRequestResult> => {
  const subroutine = await generateSubroutine({
    request: params.request,
    viewerId: params.viewerId,
    integrations: params.integrations,
    organizationId: params.organizationId,
    useMock: params.useMock,
  });

  if (!subroutine.initialInputs) {
    throw new Error("Generated subroutine is missing initial inputs");
  }

  const run = await runSubroutine({
    subroutineId: subroutine.id,
    organizationId: params.organizationId,
    viewerId: params.viewerId,
    inputs: subroutine.initialInputs,
    timeoutMs: params.timeoutMs,
    wait: params.wait,
  });

  return { subroutine, run };
};
