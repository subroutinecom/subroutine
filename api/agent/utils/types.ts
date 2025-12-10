import type { SandboxExecutionResult } from "../../services/sandbox.ts";

export type CodeGenerationResult = {
  success: boolean;
  source: string;
  inputsSchema: Record<string, unknown>;
  outputsSchema: Record<string, unknown>;
  iterations: number;
  error?: string;

  usedIntegrationIds?: string[];
  executionResult?: SandboxExecutionResult;
};

export type SubroutineCapture = {
  inputsSchema: Record<string, unknown>;
  outputsSchema: Record<string, unknown>;
  code: string;
  executionResult?: SandboxExecutionResult;
};

/**
 * Context for MCP tool discovery during code generation.
 * Provides the information needed to look up integrations and check auth.
 */
export type McpContext = {
  organizationId: string;
  viewerId: string;
  /** Maps integration names to their IDs for quick lookup */
  integrationNameToId: Map<string, string>;
};

export type { TypeCoercerParams, TypeCoercerResult } from "../agent-type-coercer.ts";

export enum Capability {
  CODING = "coding",
  CODING_FIRSTPASS = "coding.firstpass",
  CODING_FORMAT_INPUTS = "coding.format_inputs",
  WEB_SEARCH = "web_search",
  PLANNING = "planning",
  GENERAL = "general",
}
