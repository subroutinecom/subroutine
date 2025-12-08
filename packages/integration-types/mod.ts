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
}

// Re-export types that subroutine code commonly uses
export type { Client as McpClient } from "@modelcontextprotocol/sdk/client";
export type { gmail_v1, calendar_v3 } from "googleapis";
