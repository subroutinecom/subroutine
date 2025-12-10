/**
 * Type definitions for subroutine integrations.
 * This file is provided to the AI agent for context when generating code.
 *
 * Usage in subroutine code:
 *   import type { Integrations } from "@subroutine/integration-types";
 */
import type { FromSchema, JSONSchema } from "json-schema-to-ts";

// ============================================================================
// Core Integrations Interface
// ============================================================================

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
  /** Get an MCP client by integration name */
  getMcpClient<S extends keyof Config["mcp"] & string>(
    name: S
  ): Promise<
    Config["mcp"] extends McpIntegrationShape ? TypedMcpClient<Config["mcp"][S]> : McpClient
  >;

  getMcpClient(name: string): Promise<McpClient>;

  /** Get Gmail API client (requires gmail integration) */
  getGmail(): Promise<GmailClient>;

  /** Get Google Calendar API client (requires calendar integration) */
  getCalendar(): Promise<CalendarClient>;

  /** Get GitHub API client */
  getGithub(): Promise<GithubClient>;

  /** Get a GraphQL client by integration name */
  getGraphQLClient(name: string): Promise<GraphQLClient>;

  /** Get an OpenAPI client by integration name */
  getOpenAPIClient(name: string): Promise<OpenAPIClient>;

  /**
   * Coerces a value to match a given JSON Schema.
   * If strict validation fails, uses an agentic fallback to coerce the data.
   */
  coerce<S extends object>(schema: S, value: unknown): Promise<any>;
}

// ============================================================================
// MCP Client
// ============================================================================

export type TypedMcpClient<ServerShape> = Omit<McpClient, "callTool"> & {
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
} & McpClient;

export interface McpClient {
  /** Call a tool on the MCP server */
  callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<McpToolResult>;

  /** List available tools */
  listTools(): Promise<{ tools: McpTool[] }>;

  /** List available resources */
  listResources(): Promise<{ resources: McpResource[] }>;

  /** Read a resource by URI */
  readResource(params: { uri: string }): Promise<McpResourceContent>;

  /** List available prompts */
  listPrompts(): Promise<{ prompts: McpPrompt[] }>;

  /** Get a prompt by name */
  getPrompt(params: { name: string; arguments?: Record<string, string> }): Promise<McpPromptResult>;
}

interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

interface McpResourceContent {
  contents: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
  }>;
}

interface McpPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

interface McpPromptResult {
  messages: Array<{
    role: "user" | "assistant";
    content: { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
  }>;
}

interface McpToolResult {
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
    | { type: "resource"; resource: { uri: string; mimeType?: string; text?: string } }
  >;
  isError?: boolean;
}

// ============================================================================
// GraphQL Client (minimal subset used by subroutines)
// ============================================================================

export interface GraphQLClient {
  request<TData = unknown, TVariables extends Record<string, unknown> = Record<string, unknown>>(
    query: string,
    variables?: TVariables
  ): Promise<TData>;
}

// ============================================================================
// OpenAPI Client (minimal subset used by subroutines)
// ============================================================================

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

// ============================================================================
// Gmail Client (simplified from googleapis)
// ============================================================================

export interface GmailClient {
  users: {
    messages: {
      /** List messages in the user's mailbox */
      list(params: {
        userId: string;
        maxResults?: number;
        pageToken?: string;
        q?: string;
        labelIds?: string[];
        includeSpamTrash?: boolean;
      }): Promise<{ data: GmailMessageList }>;

      /** Get a specific message */
      get(params: {
        userId: string;
        id: string;
        format?: "minimal" | "full" | "raw" | "metadata";
        metadataHeaders?: string[];
      }): Promise<{ data: GmailMessage }>;

      /** Send a message */
      send(params: {
        userId: string;
        requestBody: { raw: string };
      }): Promise<{ data: GmailMessage }>;

      /** Trash a message */
      trash(params: { userId: string; id: string }): Promise<{ data: GmailMessage }>;

      /** Delete a message permanently */
      delete(params: { userId: string; id: string }): Promise<void>;

      /** Modify message labels */
      modify(params: {
        userId: string;
        id: string;
        requestBody: {
          addLabelIds?: string[];
          removeLabelIds?: string[];
        };
      }): Promise<{ data: GmailMessage }>;
    };

    labels: {
      /** List all labels */
      list(params: { userId: string }): Promise<{ data: { labels: GmailLabel[] } }>;

      /** Get a specific label */
      get(params: { userId: string; id: string }): Promise<{ data: GmailLabel }>;

      /** Create a new label */
      create(params: {
        userId: string;
        requestBody: { name: string; labelListVisibility?: string; messageListVisibility?: string };
      }): Promise<{ data: GmailLabel }>;
    };

    drafts: {
      /** List drafts */
      list(params: { userId: string; maxResults?: number; pageToken?: string }): Promise<{
        data: { drafts: Array<{ id: string; message: GmailMessage }> };
      }>;

      /** Create a draft */
      create(params: {
        userId: string;
        requestBody: { message: { raw: string } };
      }): Promise<{ data: { id: string; message: GmailMessage } }>;

      /** Send a draft */
      send(params: {
        userId: string;
        requestBody: { id: string };
      }): Promise<{ data: GmailMessage }>;
    };

    threads: {
      /** List threads */
      list(params: {
        userId: string;
        maxResults?: number;
        pageToken?: string;
        q?: string;
        labelIds?: string[];
      }): Promise<{ data: { threads: GmailThread[]; nextPageToken?: string } }>;

      /** Get a thread */
      get(params: {
        userId: string;
        id: string;
        format?: "minimal" | "full" | "metadata";
      }): Promise<{ data: GmailThread }>;
    };
  };
}

interface GmailMessageList {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: GmailMessagePart;
  sizeEstimate?: number;
  historyId?: string;
  internalDate?: string;
  raw?: string;
  headers?: { name: string; value: string }[];
}

interface GmailMessagePart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { size: number; data?: string; attachmentId?: string };
  parts?: GmailMessagePart[];
}

interface GmailLabel {
  id: string;
  name: string;
  type?: "system" | "user";
  messageListVisibility?: "show" | "hide";
  labelListVisibility?: "labelShow" | "labelShowIfUnread" | "labelHide";
  messagesTotal?: number;
  messagesUnread?: number;
  threadsTotal?: number;
  threadsUnread?: number;
}

interface GmailThread {
  id: string;
  snippet?: string;
  historyId?: string;
  messages?: GmailMessage[];
}

// ============================================================================
// Calendar Client (simplified from googleapis)
// ============================================================================

export interface CalendarClient {
  events: {
    /** List events on a calendar */
    list(params: {
      calendarId: string;
      timeMin?: string;
      timeMax?: string;
      maxResults?: number;
      pageToken?: string;
      singleEvents?: boolean;
      orderBy?: "startTime" | "updated";
      q?: string;
    }): Promise<{ data: { items: CalendarEvent[]; nextPageToken?: string } }>;

    /** Get a specific event */
    get(params: { calendarId: string; eventId: string }): Promise<{ data: CalendarEvent }>;

    /** Create an event */
    insert(params: {
      calendarId: string;
      requestBody: CalendarEventInput;
      sendUpdates?: "all" | "externalOnly" | "none";
    }): Promise<{ data: CalendarEvent }>;

    /** Update an event */
    update(params: {
      calendarId: string;
      eventId: string;
      requestBody: CalendarEventInput;
      sendUpdates?: "all" | "externalOnly" | "none";
    }): Promise<{ data: CalendarEvent }>;

    /** Delete an event */
    delete(params: {
      calendarId: string;
      eventId: string;
      sendUpdates?: "all" | "externalOnly" | "none";
    }): Promise<void>;

    /** Quick add an event from text */
    quickAdd(params: { calendarId: string; text: string }): Promise<{ data: CalendarEvent }>;
  };

  calendarList: {
    /** List calendars */
    list(params?: { maxResults?: number; pageToken?: string }): Promise<{
      data: { items: CalendarListEntry[]; nextPageToken?: string };
    }>;

    /** Get a calendar */
    get(params: { calendarId: string }): Promise<{ data: CalendarListEntry }>;
  };

  calendars: {
    /** Get calendar metadata */
    get(params: { calendarId: string }): Promise<{ data: Calendar }>;

    /** Create a new calendar */
    insert(params: { requestBody: { summary: string; description?: string } }): Promise<{
      data: Calendar;
    }>;
  };

  freebusy: {
    /** Query free/busy information */
    query(params: {
      requestBody: {
        timeMin: string;
        timeMax: string;
        items: Array<{ id: string }>;
      };
    }): Promise<{
      data: {
        calendars: Record<string, { busy: Array<{ start: string; end: string }> }>;
      };
    }>;
  };
}

interface CalendarEvent {
  id: string;
  status?: "confirmed" | "tentative" | "cancelled";
  htmlLink?: string;
  summary?: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: "needsAction" | "declined" | "tentative" | "accepted";
    organizer?: boolean;
  }>;
  organizer?: { email: string; displayName?: string };
  recurrence?: string[];
  recurringEventId?: string;
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{ method: "email" | "popup"; minutes: number }>;
  };
}

interface CalendarEventInput {
  summary?: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: Array<{ email: string }>;
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{ method: "email" | "popup"; minutes: number }>;
  };
  recurrence?: string[];
}

interface CalendarListEntry {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  accessRole: "freeBusyReader" | "reader" | "writer" | "owner";
  backgroundColor?: string;
  foregroundColor?: string;
}

interface Calendar {
  id: string;
  summary: string;
  description?: string;
  timeZone?: string;
}

// ============================================================================
// GitHub Client
// ============================================================================

export interface GithubClient {
  /** Get authenticated user info */
  me(): Promise<{ login: string }>;
  // Add more GitHub methods as needed
}
