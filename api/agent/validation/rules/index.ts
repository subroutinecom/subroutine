import type { ValidationRule } from "../types.ts";
import { noCtxUsage } from "./no-ctx-usage.ts";
import { noFetchCalls } from "./no-fetch-calls.ts";
import { noNestedImports } from "./no-nested-imports.ts";
import { requireAsyncMain } from "./require-async-main.ts";
import { requireAwaitMcpClient } from "./require-await-mcp-client.ts";
import { requireExportMain } from "./require-export-main.ts";
import { requireInputsType } from "./require-inputs-type.ts";
import { requireMcpClientAccess } from "./require-mcp-client-access.ts";
import { requireOutputsType } from "./require-outputs-type.ts";
import { requireReturnInMain } from "./require-return-in-main.ts";
import { validateGraphqlQueries } from "./validate-graphql-queries.ts";
import { validateMcpIntegrationName } from "./validate-mcp-integration-name.ts";

export const rules: ValidationRule[] = [
  requireExportMain,
  requireAsyncMain,
  requireInputsType,
  requireOutputsType,
  requireReturnInMain,
  noCtxUsage,
  noFetchCalls,
  requireMcpClientAccess,
  requireAwaitMcpClient,
  validateMcpIntegrationName,
  validateGraphqlQueries,
  noNestedImports,
];

export {
  noCtxUsage,
  noFetchCalls,
  noNestedImports,
  requireAsyncMain,
  requireAwaitMcpClient,
  requireExportMain,
  requireInputsType,
  requireMcpClientAccess,
  requireOutputsType,
  requireReturnInMain,
  validateGraphqlQueries,
  validateMcpIntegrationName,
};
