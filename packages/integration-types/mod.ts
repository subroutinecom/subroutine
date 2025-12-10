import type { Client } from "@modelcontextprotocol/sdk/client";
import type { calendar_v3, gmail_v1 } from "googleapis";
import type { FromSchema, JSONSchema } from "json-schema-to-ts";

export function pmarker(_hash: string): void {}

// Helper types for MCP Integration Shape
export type McpIntegrationShape = {
  [serverName: string]: {
    [toolName: string]: {
      inputSchema: JSONSchema;
    };
  };
};

export type IntegrationConfig = {
  mcp?: McpIntegrationShape;
};

export interface Integrations<Config extends IntegrationConfig = IntegrationConfig> {
  getMcpClient<S extends keyof Config["mcp"] & string>(
    name: S
  ): Promise<Config["mcp"] extends McpIntegrationShape ? TypedMcpClient<Config["mcp"][S]> : Client>;
  getMcpClient(name: string): Promise<Client>;
  getGmail(): Promise<gmail_v1.Gmail>;
  getCalendar(): Promise<calendar_v3.Calendar>;
  getS3(): Promise<{ listBuckets(): Promise<{ buckets: string[] }> }>;
  getGithub(): Promise<{ me(): Promise<{ login: string }> }>;
  getPing(): Promise<{ ping(message: string): Promise<{ echo: string; timestamp: number }> }>;
  getGraphQLClient(name: string): Promise<GraphQLClient>;
  getOpenAPIClient(name: string): Promise<OpenAPIClient>;
}

export type TypedMcpClient<ServerShape> = Omit<Client, "callTool"> & {
  callTool<T extends keyof ServerShape & string>(
    args: {
      name: T;
      arguments: ServerShape[T] extends { inputSchema: infer IS }
        ? IS extends JSONSchema
          ? FromSchema<IS>
          : never
        : never;
    },
    resultSchema?: any // We don't have output schema in Shape yet widely but keeping for compat
  ): Promise<any>; // Returning any for result as we focus on input typing first
};

export interface GraphQLClient {
  request<TData = unknown, TVariables extends Record<string, unknown> = Record<string, unknown>>(
    query: string,
    variables?: TVariables
  ): Promise<TData>;
}

export interface OpenAPIClient {
  request<T = unknown>(
    method: string,
    path: string,
    params?: Record<string, unknown>,
    body?: unknown
  ): Promise<T>;
  getOperations(): Array<{ method: string; path: string; summary?: string }>;
  getOperation(
    method: string,
    path: string
  ): { method: string; path: string; summary?: string } | null;
}

// Re-export types that subroutine code commonly uses
export type { Client as McpClient } from "@modelcontextprotocol/sdk/client";
export type { calendar_v3, gmail_v1 } from "googleapis";

export type SimpleTestType = {
  foo: string;
};
