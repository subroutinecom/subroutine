import type { gmail_v1, calendar_v3 } from "googleapis";
import type { Client } from "@modelcontextprotocol/sdk/client";

export function pmarker(_hash: string): void {}

export interface Integrations {
  getMcpClient(name: string): Promise<Client>;
  getGmail(): Promise<gmail_v1.Gmail>;
  getCalendar(): Promise<calendar_v3.Calendar>;
  getS3(): Promise<{ listBuckets(): Promise<{ buckets: string[] }> }>;
  getGithub(): Promise<{ me(): Promise<{ login: string }> }>;
  getPing(): Promise<{ ping(message: string): Promise<{ echo: string; timestamp: number }> }>;
  getGraphQLClient(name: string): Promise<GraphQLClient>;
  getOpenAPIClient(name: string): Promise<OpenAPIClient>;
}

export interface GraphQLClient {
  request<TData = unknown, TVariables extends Record<string, unknown> = Record<string, unknown>>(
    query: string,
    variables?: TVariables,
  ): Promise<TData>;
}

export interface OpenAPIClient {
  request<T = unknown>(
    method: string,
    path: string,
    params?: Record<string, unknown>,
    body?: unknown,
  ): Promise<T>;
  getOperations(): Array<{ method: string; path: string; summary?: string }>;
  getOperation(method: string, path: string): { method: string; path: string; summary?: string } | null;
}

// Re-export types that subroutine code commonly uses
export type { Client as McpClient } from "@modelcontextprotocol/sdk/client";
export type { gmail_v1, calendar_v3 } from "googleapis";
