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
 * GraphQL integration info for validation
 */
export type GraphQLIntegrationSchema = {
  /** Integration name as used in import path */
  name: string;
  /** GraphQL schema in SDL format */
  schema: string;
};

/**
 * Context for validation rules that need runtime information
 * (e.g., list of valid integration names, GraphQL schemas)
 */
export type ValidationContext = {
  /** Names of available MCP integrations that can be used with getMcpClient() */
  mcpIntegrationNames?: string[];
  /** GraphQL integrations with their schemas for query validation */
  graphqlIntegrations?: GraphQLIntegrationSchema[];
};

/** All validation rules receive context - they can choose to use it or not */
export type ValidationRule = (
  sourceFile: SourceFile,
  context?: ValidationContext
) => ValidationError[];
