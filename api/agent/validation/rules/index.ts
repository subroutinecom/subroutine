import type { ValidationRule } from "../types";
import { noCtxUsage } from "./no-ctx-usage";
import { noFetchCalls } from "./no-fetch-calls";
import { noNestedImports } from "./no-nested-imports";
import { requireAsyncMain } from "./require-async-main";
import { requireAwaitMcpClient } from "./require-await-mcp-client";
import { requireExportMain } from "./require-export-main";
import { requireInputsType } from "./require-inputs-type";
import { requireMcpClientAccess } from "./require-mcp-client-access";
import { requireOutputsType } from "./require-outputs-type";
import { requireReturnInMain } from "./require-return-in-main";
import { validateGraphqlQueries } from "./validate-graphql-queries";
import { validateMcpIntegrationName } from "./validate-mcp-integration-name";
import { validateOpenAPICalls } from "./validate-openapi-calls";

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
  validateOpenAPICalls,
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
  validateOpenAPICalls,
};
