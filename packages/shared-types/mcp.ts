/**
 * Shared MCP types used across API and Sandbox.
 *
 * These types define the contract between the API (which configures MCP integrations)
 * and the Sandbox (which connects to MCP servers).
 */

/**
 * Authentication strategy for MCP server integrations.
 *
 * - `none`: No authentication required
 * - `api_key`: Static API key sent in a header (default: Authorization: Bearer)
 * - `bearer_passthrough`: Pass viewer's OAuth access token to MCP server
 * - `custom_headers`: Arbitrary custom headers for authentication
 */
export type McpAuthStrategy =
  | { type: "none" }
  | { type: "api_key"; headerName?: string }
  | { type: "bearer_passthrough" }
  | { type: "custom_headers"; headers: Record<string, string> };

/**
 * Transport protocol for MCP server communication.
 *
 * - `sse`: Server-Sent Events (most common for HTTP MCP servers)
 * - `streamable-http`: Streamable HTTP transport (newer, bidirectional)
 */
export type McpTransport = "sse" | "streamable-http";

/**
 * MCP-specific configuration for sandbox integrations.
 * Contains all info needed to connect to an MCP server from the sandbox.
 */
export interface SandboxMcpConfig {
  serverUrl: string;
  transport: McpTransport;
  authStrategy: McpAuthStrategy;
  /** API key for api_key auth strategy */
  apiKey?: string;
  /** Access token for bearer_passthrough auth strategy (from viewer's connected account) */
  accessToken?: string;
}
