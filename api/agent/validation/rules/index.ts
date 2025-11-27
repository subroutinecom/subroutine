import type { ValidationRule } from "../types";
import { requireInputsType } from "./require-inputs-type";
import { requireOutputsType } from "./require-outputs-type";
import { requireExportMain } from "./require-export-main";
import { requireAsyncMain } from "./require-async-main";
import { requireReturnInMain } from "./require-return-in-main";
import { noCtxUsage } from "./no-ctx-usage";
import { noFetchCalls } from "./no-fetch-calls";
import { requireMcpClientAccess } from "./require-mcp-client-access";

export const rules: ValidationRule[] = [
  requireExportMain,
  requireAsyncMain,
  requireInputsType,
  requireOutputsType,
  requireReturnInMain,
  noCtxUsage,
  noFetchCalls,
  requireMcpClientAccess,
];

export {
  requireInputsType,
  requireOutputsType,
  requireExportMain,
  requireAsyncMain,
  requireReturnInMain,
  noCtxUsage,
  noFetchCalls,
  requireMcpClientAccess,
};
