import type { SourceFile } from "ts-morph";

export type ValidationError = {
  rule: string;
  message: string;
  line?: number;
  column?: number;
};

export type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
};

/**
 * Context for validation rules that need runtime information
 * (e.g., list of valid integration names)
 */
export type ValidationContext = {
  /** Names of available MCP integrations that can be used with getMcpClient() */
  mcpIntegrationNames?: string[];
};

/** All validation rules receive context - they can choose to use it or not */
export type ValidationRule = (
  sourceFile: SourceFile,
  context?: ValidationContext
) => ValidationError[];
