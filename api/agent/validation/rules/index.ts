import type { ValidationRule } from "../types";
import { noCtxUsage } from "./no-ctx-param";
import { noFetchCalls } from "./no-network-fetch";
import { noNestedImports } from "./no-nested-imports";
import { requireAsyncMain } from "./main-must-be-async";
import { requireAwaitMcpClient } from "./await-mcp-client";
import { requireExportMain } from "./main-must-be-exported";
import { requireInputsType } from "./must-define-inputs-type";
import { requireMcpClientAccess } from "./only-allow-standard-integrations-methods";
import { requireOutputsType } from "./must-define-outputs-type";
import { requireReturnInMain } from "./main-must-return-outputs";
import { validateGraphqlQueries } from "./validate-graphql-schema";
import { validateMcpIntegrationName } from "./verify-integration-names-exist";
import { validateOpenAPICalls } from "./validate-openapi-schema";

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
